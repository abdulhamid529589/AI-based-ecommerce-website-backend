import ErrorHandler from '../middlewares/errorMiddleware.js'
import { catchAsyncErrors } from '../middlewares/catchAsyncError.js'
import database from '../database/db.js'
import { generatePaymentIntent } from '../utils/generatePaymentIntent.js'
import { validateOrderData } from '../utils/inputValidator.js'
import { logOrderCreation, logValidationFailure } from '../utils/auditLogger.js'
import { withTransaction } from '../utils/transactionHelper.js'
import {
  createReservations,
  expireStaleReservationsSafe,
  commitReservationsForOrder,
} from '../utils/inventoryReservation.js'
import { creditEarningsForOrder } from '../utils/vendorWallet.js'
import { resolvePromoForCart, recordPromoUsage } from '../utils/promoEngine.js'
import { redeemPoints } from '../utils/loyalty.js'

export const placeNewOrder = catchAsyncErrors(async (req, res, next) => {
  try {
    console.log('🔹 [Order Controller] Received order creation request')
    console.log('🔹 [Order Controller] Headers:', {
      'X-Idempotency-Key': req.headers['x-idempotency-key'] ? '✅' : '❌',
      'X-Request-ID': req.headers['x-request-id'] ? '✅' : '❌',
      'X-CSRF-Token': req.headers['x-csrf-token'] ? '✅' : '❌',
      Authorization: req.headers.authorization ? '✅' : '❌',
    })
    console.log('🔹 [Order Controller] User ID:', req.user?.id)
    console.log('🔹 [Order Controller] Payload keys:', Object.keys(req.body))

    const {
      full_name,
      state,
      city,
      country,
      address,
      pincode,
      phone,
      orderedItems,
      paymentMethod,
      promoCode,
      loyaltyPoints,
    } = req.body

    // Verify user is authenticated
    if (!req.user || !req.user.id) {
      return next(new ErrorHandler('User not authenticated.', 401))
    }

    // 🔒 VALIDATE AND SANITIZE ALL INPUT
    let validatedData
    try {
      console.log('🔹 [Order Controller] Validating order data...')
      validatedData = validateOrderData({
        full_name,
        state,
        city,
        country,
        address,
        pincode,
        phone,
        orderedItems,
        paymentMethod,
      })
      console.log('🔹 [Order Controller] Validation passed ✅')
    } catch (validationError) {
      console.error('🔹 [Order Controller] Validation failed:', validationError.message)
      // Log validation failure for security monitoring
      await logValidationFailure(
        req.user.id,
        req.ip,
        validationError.message.split(' ')[0],
        validationError.message,
      )
      return next(validationError)
    }

    // 🔒 CRITICAL FIX #7: Check for idempotency key to prevent duplicate charges
    // Support both 'X-Idempotency-Key' (standard) and 'idempotency-key' (fallback)
    const idempotencyKey = req.headers['x-idempotency-key'] || req.headers['idempotency-key']
    if (!idempotencyKey) {
      return next(new ErrorHandler('X-Idempotency-Key header required for order creation', 400))
    }

    // Check if order already created with this idempotency key
    const existingOrder = await database.query(
      'SELECT id, total_price, tax_price, shipping_price FROM orders WHERE idempotency_key = $1 AND buyer_id = $2',
      [idempotencyKey, req.user.id],
    )

    if (existingOrder.rows[0]) {
      // Return cached response to prevent duplicate processing
      console.log('📦 Order already created with this idempotency key:', idempotencyKey)
      return res.status(200).json({
        success: true,
        message: 'Order already processed',
        order: { id: existingOrder.rows[0].id },
        total_price: existingOrder.rows[0].total_price,
        tax_price: existingOrder.rows[0].tax_price,
        shipping_price: existingOrder.rows[0].shipping_price,
        cached: true,
      })
    }

    const items = Array.isArray(validatedData.orderedItems)
      ? validatedData.orderedItems
      : JSON.parse(validatedData.orderedItems)
    const productIds = items.map((item) => item.product.id)
    const { rows: products } = await database.query(
      `SELECT p.id, p.price, p.stock, p.name, p.shop_id, p.images,
              s.commission_rate, s.status AS shop_status, s.name AS shop_name
       FROM products p
       LEFT JOIN shops s ON s.id = p.shop_id
       WHERE p.id = ANY($1::uuid[])`,
      [productIds],
    )

    let subtotal_price = 0
    const lineItems = []

    // 🔒 CRITICAL FIX #1: Validate each item quantity before processing
    for (const item of items) {
      const product = products.find((p) => p.id === item.product.id)

      if (!product) {
        return next(new ErrorHandler(`Product not found for ID: ${item.product.id}`, 404))
      }

      // Block purchases from non-approved vendor shops (platform/legacy products OK)
      if (product.shop_id && product.shop_status && product.shop_status !== 'approved') {
        return next(
          new ErrorHandler(
            `"${product.name}" is unavailable — seller shop is not active.`,
            400,
          ),
        )
      }

      // 🔒 Validate quantity is positive integer
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        return next(
          new ErrorHandler('Invalid quantity in order. Quantity must be at least 1.', 400),
        )
      }

      // 🔒 Validate quantity doesn't exceed maximum
      if (item.quantity > 100) {
        return next(new ErrorHandler('Maximum quantity per order is 100 items.', 400))
      }

      // Validate stock availability
      if (item.quantity > product.stock) {
        return next(
          new ErrorHandler(`Only ${product.stock} units available for ${product.name}`, 400),
        )
      }
    }

    // Calculate subtotal using database prices and validated quantities
    items.forEach((item) => {
      const product = products.find((p) => p.id === item.product.id)
      const itemTotal = parseFloat(product.price) * item.quantity
      subtotal_price += itemTotal

      // Get image URL safely - handle missing images array
      let imageUrl = ''
      try {
        const imgs =
          typeof product.images === 'string' ? JSON.parse(product.images) : product.images
        if (Array.isArray(imgs) && imgs[0]) {
          imageUrl = imgs[0].url || imgs[0] || ''
        }
      } catch {
        imageUrl =
          item.product.images && item.product.images.length > 0
            ? item.product.images[0].url
            : ''
      }

      lineItems.push({
        product_id: product.id,
        shop_id: product.shop_id || null,
        quantity: item.quantity,
        price: parseFloat(product.price),
        image: imageUrl,
        title: product.name,
        commission_rate: product.commission_rate != null ? parseFloat(product.commission_rate) : 10,
      })
    })

    // Zone-based shipping (falls back to settings if zones empty)
    let shipping_price = 100
    try {
      const { quoteShipping } = await import('../utils/shippingQuote.js')
      const quote = await quoteShipping({
        city,
        subtotal: subtotal_price,
        carrier: req.body.shippingCarrier || null,
      })
      shipping_price = quote.shipping_price
    } catch (err) {
      console.warn('Shipping quote failed, using default:', err.message)
      shipping_price = 100
    }

    // Get tax rate from settings
    let tax_rate = 0.05 // Default 5%
    try {
      const { getSetting } = await import('../models/settingsTable.js')
      const shippingSettings = await getSetting('shipping_settings')

      if (shippingSettings?.pricing?.taxRate) {
        tax_rate = shippingSettings.pricing.taxRate / 100
      }
    } catch (err) {
      console.warn('Could not load tax settings, using default 5%:', err.message)
    }

    // Calculate tax on SERVER (dynamic tax rate from settings)
    const tax_price = Math.round(subtotal_price * tax_rate)

    // Promo + loyalty (server-authoritative — never trust client discount)
    let discount_amount = 0
    let promo_code = null
    let resolvedPromo = null
    if (promoCode) {
      resolvedPromo = await resolvePromoForCart(promoCode, lineItems, req.user.id)
      if (!resolvedPromo.ok) {
        return next(new ErrorHandler(resolvedPromo.message, 400))
      }
      discount_amount = resolvedPromo.discount
      promo_code = resolvedPromo.code
    }

    let loyalty_discount = 0
    let loyalty_points_used = 0
    const ptsRequested = Math.max(0, Math.floor(Number(loyaltyPoints) || 0))
    if (ptsRequested > 0) {
      const { quoteRedeem } = await import('../utils/loyalty.js')
      const quote = await quoteRedeem(req.user.id, ptsRequested)
      if (!quote.ok) {
        return next(new ErrorHandler(quote.message, 400))
      }
      loyalty_discount = quote.discountBdt
      loyalty_points_used = quote.points
    }

    // Calculate final total: subtotal + shipping + tax − discounts
    const total_price = Math.max(
      0,
      Math.round(subtotal_price + shipping_price + tax_price - discount_amount - loyalty_discount),
    )

    // Release expired unpaid holds before allocating new stock
    await expireStaleReservationsSafe()

    // 🏪 Split into per-vendor sub-orders (platform items use shop_id = null bucket)
    const byShop = new Map()
    for (const line of lineItems) {
      const key = line.shop_id || '__platform__'
      if (!byShop.has(key)) byShop.set(key, [])
      byShop.get(key).push(line)
    }

    let orderId
    try {
      orderId = await withTransaction(async (tx) => {
        // Lock product rows to prevent oversell under concurrency
        await tx.query(`SELECT id FROM products WHERE id = ANY($1::uuid[]) FOR UPDATE`, [
          productIds,
        ])

        let orderResult
        try {
          orderResult = await tx.query(
            `INSERT INTO orders (
               buyer_id, total_price, tax_price, shipping_price, idempotency_key,
               discount_amount, promo_code, loyalty_discount, loyalty_points_used
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
            [
              req.user.id,
              total_price,
              tax_price,
              shipping_price,
              idempotencyKey,
              discount_amount,
              promo_code,
              loyalty_discount,
              loyalty_points_used,
            ],
          )
        } catch (insertErr) {
          // Concurrent duplicate idempotency key — surface as conflict
          if (insertErr.code === '23505') {
            throw new ErrorHandler('Order already processed with this idempotency key', 409)
          }
          throw insertErr
        }

        const newOrderId = orderResult.rows[0].id

        if (resolvedPromo?.promo?.id) {
          await recordPromoUsage(tx, {
            userId: req.user.id,
            promoId: resolvedPromo.promo.id,
            orderId: newOrderId,
          })
        }

        if (loyalty_points_used > 0) {
          const redeemed = await redeemPoints(tx, {
            userId: req.user.id,
            orderId: newOrderId,
            points: loyalty_points_used,
          })
          if (!redeemed.ok) {
            throw new ErrorHandler(redeemed.message || 'Loyalty redeem failed', 400)
          }
        }

        const vendorOrderIds = new Map()
        const shopEntries = [...byShop.entries()]
        let allocatedShipping = 0
        let allocatedTax = 0

        for (let i = 0; i < shopEntries.length; i++) {
          const [key, shopLines] = shopEntries[i]
          const shopSubtotal = shopLines.reduce((sum, l) => sum + l.price * l.quantity, 0)
          const shopId = key === '__platform__' ? null : key
          const commissionRate = shopLines[0]?.commission_rate ?? 10
          const commissionAmount =
            Math.round(((shopSubtotal * commissionRate) / 100) * 100) / 100
          const vendorEarning = Math.round((shopSubtotal - commissionAmount) * 100) / 100

          // Proportional shipping/tax; last bucket absorbs rounding remainder
          let shippingShare = 0
          let taxShare = 0
          if (subtotal_price > 0) {
            if (i === shopEntries.length - 1) {
              shippingShare = Math.round((shipping_price - allocatedShipping) * 100) / 100
              taxShare = Math.round((tax_price - allocatedTax) * 100) / 100
            } else {
              shippingShare =
                Math.round((shipping_price * (shopSubtotal / subtotal_price)) * 100) / 100
              taxShare = Math.round((tax_price * (shopSubtotal / subtotal_price)) * 100) / 100
              allocatedShipping += shippingShare
              allocatedTax += taxShare
            }
          }

          if (shopId) {
            const vo = await tx.query(
              `INSERT INTO vendor_orders (
                 order_id, shop_id, subtotal, shipping_share, tax_share,
                 commission_rate, commission_amount, vendor_earning, status
               ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Processing')
               RETURNING id`,
              [
                newOrderId,
                shopId,
                shopSubtotal,
                shippingShare,
                taxShare,
                commissionRate,
                commissionAmount,
                vendorEarning,
              ],
            )
            vendorOrderIds.set(shopId, vo.rows[0].id)

            // Count order now; total_sales only when payment is confirmed
            await tx.query(
              `UPDATE shops SET
                 total_orders = total_orders + 1,
                 updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [shopId],
            )
          }

          for (const line of shopLines) {
            await tx.query(
              `INSERT INTO order_items (
                 order_id, product_id, quantity, price, image, title, shop_id, vendor_order_id
               ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
              [
                newOrderId,
                line.product_id,
                line.quantity,
                line.price,
                line.image,
                line.title,
                shopId,
                shopId ? vendorOrderIds.get(shopId) : null,
              ],
            )

            // Conditional stock decrement — fails closed if concurrent oversell
            const stockResult = await tx.query(
              `UPDATE products SET stock = stock - $1
               WHERE id = $2 AND stock >= $1
               RETURNING id, stock`,
              [line.quantity, line.product_id],
            )
            if (!stockResult.rows[0]) {
              throw new ErrorHandler(
                `Insufficient stock for "${line.title}". Please reduce quantity and try again.`,
                400,
              )
            }
          }
        }

        await tx.query(
          `INSERT INTO shipping_info (order_id, full_name, state, city, country, address, pincode, phone)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [newOrderId, full_name, state, city, country, address, pincode, phone],
        )

        await tx.query(
          `INSERT INTO payments (order_id, payment_type, payment_status, payment_intent_id)
           VALUES ($1, $2, 'Pending', $3)
           ON CONFLICT (order_id) DO NOTHING`,
          [newOrderId, paymentMethod || 'COD', newOrderId],
        )

        // TTL stock hold — unpaid online orders auto-release after expiry
        await createReservations(tx, newOrderId, lineItems, paymentMethod || 'COD')

        return newOrderId
      })
    } catch (txError) {
      if (txError.statusCode) {
        return next(txError)
      }
      throw txError
    }

    // Notify shop owners of new vendor sub-orders
    try {
      const { createNotificationRecord } = await import('./notificationController.js')
      const owners = await database.query(
        `SELECT DISTINCT s.owner_id, s.name, vo.id AS vendor_order_id, vo.subtotal
         FROM vendor_orders vo
         JOIN shops s ON s.id = vo.shop_id
         WHERE vo.order_id = $1`,
        [orderId],
      )
      for (const row of owners.rows) {
        await createNotificationRecord({
          userId: row.owner_id,
          type: 'order',
          title: 'New order received',
          message: `New order for ${row.name} · ৳${Number(row.subtotal).toLocaleString()}`,
          data: { orderId, vendorOrderId: row.vendor_order_id },
          priority: 'high',
        })
      }
    } catch (notifyErr) {
      console.warn('Vendor order notify skipped:', notifyErr.message)
    }

    // For COD, skip online payment gateway and just return success
    if (paymentMethod === 'COD') {
      console.log('COD Order created successfully:', orderId)
      await logOrderCreation(req.user.id, orderId, total_price, 'COD', 'SUCCESS')
      return res.status(200).json({
        success: true,
        message: 'Order placed successfully. Payment pending on delivery.',
        order: { id: orderId },
        total_price,
        tax_price,
        shipping_price,
        discount_amount,
        loyalty_discount,
        promo_code,
      })
    }

    await logOrderCreation(req.user.id, orderId, total_price, paymentMethod, 'SUCCESS')

    res.status(200).json({
      success: true,
      message: 'Order placed successfully. Please proceed to payment.',
      orderId,
      order: { id: orderId },
      total_price,
      tax_price,
      shipping_price,
      discount_amount,
      loyalty_discount,
      promo_code,
      paymentMethod,
    })
  } catch (error) {
    console.error('Order creation error:', error.message)
    console.error('Full error:', error)
    if (req.user?.id) {
      await logOrderCreation(req.user.id, 'unknown', 0, 'unknown', 'FAILURE')
    }
    if (error.statusCode) {
      return next(error)
    }
    return next(new ErrorHandler(error.message || 'Failed to create order', 500))
  }
})

export const fetchSingleOrder = catchAsyncErrors(async (req, res, next) => {
  const { orderId } = req.params
  const result = await database.query(
    `
    SELECT
      o.*,
      COALESCE(
        json_agg(
          jsonb_build_object(
            'order_item_id', oi.id,
            'order_id', oi.order_id,
            'product_id', oi.product_id,
            'quantity', oi.quantity,
            'price', oi.price,
            'image', oi.image,
            'title', oi.title,
            'shop_id', oi.shop_id,
            'vendor_order_id', oi.vendor_order_id,
            'shop_name', sh.name,
            'shop_slug', sh.slug
          )
        ) FILTER (WHERE oi.id IS NOT NULL),
        '[]'
      ) AS order_items,
      json_build_object(
        'full_name', s.full_name,
        'state', s.state,
        'city', s.city,
        'country', s.country,
        'address', s.address,
        'pincode', s.pincode,
        'phone', s.phone
      ) AS shipping_info
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    LEFT JOIN shops sh ON sh.id = oi.shop_id
    LEFT JOIN shipping_info s ON o.id = s.order_id
    WHERE o.id = $1
    GROUP BY o.id, s.id;
    `,
    [orderId],
  )

  if (!result.rows[0]) {
    return next(new ErrorHandler('Order not found.', 404))
  }

  // Buyers can only see their own orders; Admin can see all
  if (req.user.role !== 'Admin' && result.rows[0].buyer_id !== req.user.id) {
    return next(new ErrorHandler('Not authorized to view this order.', 403))
  }

  // Attach vendor sub-orders (multi-vendor fulfillment)
  const vendorOrders = await database.query(
    `SELECT vo.*,
            sh.name AS shop_name,
            sh.slug AS shop_slug,
            sh.logo AS shop_logo,
            (
              SELECT json_agg(json_build_object(
                'id', oi.id,
                'product_id', oi.product_id,
                'title', oi.title,
                'quantity', oi.quantity,
                'price', oi.price,
                'image', oi.image
              ))
              FROM order_items oi
              WHERE oi.vendor_order_id = vo.id
            ) AS items
     FROM vendor_orders vo
     JOIN shops sh ON sh.id = vo.shop_id
     WHERE vo.order_id = $1
     ORDER BY vo.created_at ASC`,
    [orderId],
  )

  const order = {
    ...result.rows[0],
    vendor_orders: vendorOrders.rows,
  }

  res.status(200).json({
    success: true,
    message: 'Order fetched.',
    order,
    orders: order,
  })
})

export const fetchMyOrders = catchAsyncErrors(async (req, res, next) => {
  const result = await database.query(
    `
        SELECT o.*, COALESCE(
 json_agg(
  json_build_object(
 'order_item_id', oi.id,
 'order_id', oi.order_id,
 'product_id', oi.product_id,
 'quantity', oi.quantity,
 'price', oi.price,
 'image', oi.image,
 'title', oi.title,
 'shop_id', oi.shop_id,
 'shop_name', sh.name,
 'shop_slug', sh.slug
  )
 ) FILTER (WHERE oi.id IS NOT NULL), '[]'
 ) AS order_items,
CASE
  WHEN s.id IS NOT NULL THEN
    json_build_object(
      'full_name', s.full_name,
      'state', s.state,
      'city', s.city,
      'country', s.country,
      'address', s.address,
      'pincode', s.pincode,
      'phone', s.phone
    )
  ELSE NULL
END AS shipping_info,
json_build_object(
'id', u.id,
'name', u.name,
'email', u.email
) AS user_info,
COALESCE(p.payment_status, 'Pending') AS payment_status,
p.payment_type,
p.created_at AS payment_created_at,
(
  SELECT COALESCE(json_agg(json_build_object(
    'id', vo.id,
    'shop_id', vo.shop_id,
    'shop_name', vs.name,
    'shop_slug', vs.slug,
    'status', vo.status,
    'subtotal', vo.subtotal,
    'tracking_number', vo.tracking_number
  ) ORDER BY vo.created_at), '[]')
  FROM vendor_orders vo
  JOIN shops vs ON vs.id = vo.shop_id
  WHERE vo.order_id = o.id
) AS vendor_orders
 FROM orders o
 LEFT JOIN order_items oi ON o.id = oi.order_id
 LEFT JOIN shops sh ON sh.id = oi.shop_id
 LEFT JOIN shipping_info s ON o.id = s.order_id
 LEFT JOIN users u ON o.buyer_id = u.id
 LEFT JOIN payments p ON o.id = p.order_id
WHERE o.buyer_id = $1
GROUP BY o.id, s.id, u.id, p.id
ORDER BY o.created_at DESC
        `,
    [req.user.id],
  )

  res.status(200).json({
    success: true,
    message: 'All your orders are fetched.',
    myOrders: result.rows,
  })
})

export const fetchAllOrders = catchAsyncErrors(async (req, res, next) => {
  console.log(`📦 fetchAllOrders called - User: ${req.user?.name}, Role: ${req.user?.role}`)

  // Get query parameters for filtering and pagination
  const { status, page = 1, limit = 10 } = req.query
  const pageNum = Math.max(1, parseInt(page) || 1)
  const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 10)) // Max 100 per page
  const offset = (pageNum - 1) * limitNum

  // Build WHERE clause for filtering
  let whereClause = ''
  const queryParams = []

  if (status) {
    whereClause = 'WHERE o.order_status = $1'
    queryParams.push(status)
  }

  // Get total count first
  const countQuery = `SELECT COUNT(DISTINCT o.id) as count FROM orders o ${whereClause}`
  const countResult = await database.query(countQuery, queryParams)
  const totalCount = parseInt(countResult.rows[0].count)
  const totalPages = Math.ceil(totalCount / limitNum)

  // Get paginated results
  const paramIndex = queryParams.length + 1
  const result = await database.query(
    `
            SELECT o.*,
 COALESCE(json_agg(
 json_build_object(
 'order_item_id', oi.id,
 'order_id', oi.order_id,
 'product_id', oi.product_id,
 'quantity', oi.quantity,
 'price', oi.price,
 'image', oi.image,
 'title', oi.title
)
) FILTER (WHERE oi.id IS NOT NULL), '[]' ) AS order_items,
CASE
  WHEN s.id IS NOT NULL THEN
    json_build_object(
      'full_name', s.full_name,
      'state', s.state,
      'city', s.city,
      'country', s.country,
      'address', s.address,
      'pincode', s.pincode,
      'phone', s.phone
    )
  ELSE NULL
END AS shipping_info,
json_build_object(
'id', u.id,
'name', u.name,
'email', u.email
) AS user_info,
COALESCE(p.payment_status, 'Pending') AS payment_status,
p.payment_type,
p.created_at AS payment_created_at
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
LEFT JOIN shipping_info s ON o.id = s.order_id
LEFT JOIN users u ON o.buyer_id = u.id
LEFT JOIN payments p ON o.id = p.order_id
${whereClause}
GROUP BY o.id, s.id, u.id, p.id
ORDER BY o.created_at DESC
LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `,
    [...queryParams, limitNum, offset],
  )

  console.log(`✅ Orders query returned ${result.rows.length} rows`)
  res.status(200).json({
    success: true,
    message: 'All orders fetched.',
    data: {
      orders: result.rows,
    },
    pagination: {
      page: pageNum,
      limit: limitNum,
      totalCount,
      totalPages,
    },
  })
})

export const updateOrderStatus = catchAsyncErrors(async (req, res, next) => {
  // Accept both 'status' and 'order_status' for flexibility
  let status = req.body.status || req.body.order_status
  if (!status) {
    return next(new ErrorHandler('Provide a valid status for order.', 400))
  }

  // Normalize status to match database constraints
  const validStatuses = {
    processing: 'Processing',
    shipped: 'Shipped',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  }

  const normalizedStatus = validStatuses[status.toLowerCase()]
  if (!normalizedStatus) {
    return next(
      new ErrorHandler(
        'Invalid status. Allowed values: Processing, Shipped, Delivered, Cancelled',
        400,
      ),
    )
  }

  const { orderId } = req.params
  const results = await database.query(
    `
    SELECT * FROM orders WHERE id = $1
    `,
    [orderId],
  )

  if (results.rows.length === 0) {
    return next(new ErrorHandler('Invalid order ID.', 404))
  }

  const updatedOrder = await database.query(
    `
    UPDATE orders SET order_status = $1 WHERE id = $2 RETURNING *
    `,
    [normalizedStatus, orderId],
  )

  res.status(200).json({
    success: true,
    message: 'Order status updated.',
    data: updatedOrder.rows[0],
  })
})

export const updatePaymentStatus = catchAsyncErrors(async (req, res, next) => {
  const { paymentStatus } = req.body
  if (!paymentStatus) {
    return next(new ErrorHandler('Provide a valid payment status.', 400))
  }
  const { orderId } = req.params

  // Verify payment status is valid
  const validStatuses = ['Paid', 'Pending', 'Failed']
  if (!validStatuses.includes(paymentStatus)) {
    return next(new ErrorHandler('Invalid payment status. Must be Paid, Pending, or Failed.', 400))
  }

  // Check if order exists
  const orderResults = await database.query(`SELECT id FROM orders WHERE id = $1`, [orderId])

  if (orderResults.rows.length === 0) {
    return next(new ErrorHandler('Invalid order ID.', 404))
  }

  const previous = await database.query(
    `SELECT payment_status FROM payments WHERE order_id = $1`,
    [orderId],
  )
  const previousStatus = previous.rows[0]?.payment_status || null

  // Try to update existing payment status
  let results = await database.query(
    `UPDATE payments SET payment_status = $1 WHERE order_id = $2 RETURNING *`,
    [paymentStatus, orderId],
  )

  // If no payment record exists, create one
  if (results.rows.length === 0) {
    results = await database.query(
      `INSERT INTO payments (order_id, payment_type, payment_status)
       VALUES ($1, 'Online', $2)
       RETURNING *`,
      [orderId, paymentStatus],
    )
  }

  // Also update the paid_at timestamp in orders table if payment is marked as Paid
  if (paymentStatus === 'Paid') {
    await database.query(`UPDATE orders SET paid_at = NOW() WHERE id = $1`, [orderId])
    await commitReservationsForOrder(database, orderId)
    // Credit vendor sales once when transitioning into Paid
    if (previousStatus !== 'Paid') {
      await database.query(
        `UPDATE shops s
         SET total_sales = total_sales + vo.subtotal,
             updated_at = CURRENT_TIMESTAMP
         FROM vendor_orders vo
         WHERE vo.order_id = $1 AND vo.shop_id = s.id`,
        [orderId],
      )
      await withTransaction(async (tx) => {
        await creditEarningsForOrder(tx, orderId, req.user.id)
        const orderRow = await tx.query(
          `SELECT buyer_id, total_price FROM orders WHERE id = $1`,
          [orderId],
        )
        if (orderRow.rows[0]) {
          const { earnPointsForPaidOrder } = await import('../utils/loyalty.js')
          await earnPointsForPaidOrder(tx, {
            userId: orderRow.rows[0].buyer_id,
            orderId,
            totalPrice: orderRow.rows[0].total_price,
          })
        }
      })
    }
  } else {
    await database.query(`UPDATE orders SET paid_at = NULL WHERE id = $1`, [orderId])
    // Reverse sales if admin un-marks a paid order
    if (previousStatus === 'Paid') {
      await database.query(
        `UPDATE shops s
         SET total_sales = GREATEST(total_sales - vo.subtotal, 0),
             updated_at = CURRENT_TIMESTAMP
         FROM vendor_orders vo
         WHERE vo.order_id = $1 AND vo.shop_id = s.id`,
        [orderId],
      )
    }
  }

  res.status(200).json({
    success: true,
    message: 'Payment status updated.',
    payment: results.rows[0],
  })
})

export const deleteOrder = catchAsyncErrors(async (req, res, next) => {
  const { orderId } = req.params
  const results = await database.query(
    `
        DELETE FROM orders WHERE id = $1 RETURNING *
        `,
    [orderId],
  )
  if (results.rows.length === 0) {
    return next(new ErrorHandler('Invalid order ID.', 404))
  }

  res.status(200).json({
    success: true,
    message: 'Order deleted.',
    order: results.rows[0],
  })
})
