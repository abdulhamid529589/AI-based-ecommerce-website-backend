import { catchAsyncErrors } from '../middlewares/catchAsyncError.js'
import ErrorHandler from '../middlewares/errorMiddleware.js'
import database from '../database/db.js'
import bcrypt from 'bcrypt'
import { sendToken } from '../utils/jwtToken.js'
import { slugify } from '../utils/slugify.js'
import { v2 as cloudinary } from 'cloudinary'
import { deleteTempFiles } from '../utils/fileCleanup.js'
import { validateImageUpload } from '../utils/imageUploadValidation.js'
import { withTransaction } from '../utils/transactionHelper.js'
import { creditVendorOrderEarning } from '../utils/vendorWallet.js'

const sanitize = (str) => {
  if (typeof str !== 'string') return str
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '')
    .trim()
}

const normalizeShop = (shop) => {
  if (!shop) return shop
  const s = { ...shop }
  if (typeof s.logo === 'string') {
    try {
      s.logo = JSON.parse(s.logo)
    } catch {
      /* keep */
    }
  }
  if (typeof s.banner === 'string') {
    try {
      s.banner = JSON.parse(s.banner)
    } catch {
      /* keep */
    }
  }
  s.commission_rate = s.commission_rate != null ? parseFloat(s.commission_rate) : 10
  s.rating = s.rating != null ? parseFloat(s.rating) : 0
  // Never expose payout account to public consumers
  return s
}

const publicShopFields = (shop) => {
  if (!shop) return null
  const n = normalizeShop(shop)
  return {
    id: n.id,
    name: n.name,
    slug: n.slug,
    description: n.description,
    logo: n.logo,
    banner: n.banner,
    city: n.city,
    country: n.country,
    rating: n.rating,
    total_sales: n.total_sales,
    total_orders: n.total_orders,
    product_count: n.product_count,
    is_verified: n.is_verified,
    status: n.status,
    created_at: n.created_at,
  }
}

// ─── Vendor registration + shop onboarding ───────────────────────────────────

export const registerVendor = catchAsyncErrors(async (req, res, next) => {
  let { name, email, mobile, password, shop_name, shop_description, phone, city } = req.body

  if (!name || !password || !shop_name) {
    return next(new ErrorHandler('Name, password, and shop name are required.', 400))
  }
  if (!email && !mobile) {
    return next(new ErrorHandler('Provide email or mobile number.', 400))
  }
  if (password.length < 8) {
    return next(new ErrorHandler('Password must be at least 8 characters.', 400))
  }

  name = sanitize(name)
  shop_name = sanitize(shop_name)
  shop_description = shop_description ? sanitize(shop_description) : null
  city = city ? sanitize(city) : null

  if (mobile) {
    const digitsOnly = mobile.replace(/\D/g, '')
    const valid =
      (digitsOnly.length === 11 && digitsOnly.startsWith('0')) ||
      (digitsOnly.length === 10 && digitsOnly.startsWith('1')) ||
      (digitsOnly.length === 12 && digitsOnly.startsWith('880'))
    if (!valid) {
      return next(new ErrorHandler('Invalid Bangladesh mobile number.', 400))
    }
    if (digitsOnly.startsWith('880')) mobile = '+' + digitsOnly
    else if (digitsOnly.startsWith('0')) mobile = '+880' + digitsOnly.slice(1)
    else mobile = '+880' + digitsOnly

    const exists = await database.query('SELECT id FROM users WHERE mobile = $1', [mobile])
    if (exists.rows.length) {
      return next(new ErrorHandler('Mobile already registered.', 400))
    }
  }

  if (email) {
    const exists = await database.query('SELECT id FROM users WHERE email = $1', [email])
    if (exists.rows.length) {
      return next(new ErrorHandler('Email already registered.', 400))
    }
  }

  const hashedPassword = await bcrypt.hash(password, 10)
  const client = await database.connect()

  try {
    await client.query('BEGIN')

    const userResult = await client.query(
      `INSERT INTO users (name, email, mobile, password, role)
       VALUES ($1, $2, $3, $4, 'Vendor') RETURNING *`,
      [name, email || null, mobile || null, hashedPassword],
    )
    const user = userResult.rows[0]

    let slug = slugify(shop_name)
    const slugCheck = await client.query('SELECT id FROM shops WHERE slug = $1', [slug])
    if (slugCheck.rows.length) {
      slug = slugify(shop_name, { unique: true })
    }

    const shopResult = await client.query(
      `INSERT INTO shops (owner_id, name, slug, description, email, phone, city, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING *`,
      [
        user.id,
        shop_name,
        slug,
        shop_description,
        email || null,
        phone || mobile || null,
        city,
      ],
    )

    await client.query('COMMIT')

    const shop = normalizeShop(shopResult.rows[0])
    // Attach shop to user payload for frontend
    const userWithShop = { ...user, shop }
    sendToken(userWithShop, 201, 'Vendor registered. Shop pending admin approval.', res)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Vendor register error:', err)
    return next(new ErrorHandler('Vendor registration failed. Please try again.', 500))
  } finally {
    client.release()
  }
})

// ─── My shop ─────────────────────────────────────────────────────────────────

export const getMyShop = catchAsyncErrors(async (req, res, next) => {
  const result = await database.query('SELECT * FROM shops WHERE owner_id = $1', [req.user.id])
  if (!result.rows[0]) {
    return next(new ErrorHandler('Shop not found. Contact support.', 404))
  }
  res.status(200).json({
    success: true,
    shop: normalizeShop(result.rows[0]),
  })
})

export const updateMyShop = catchAsyncErrors(async (req, res, next) => {
  const shop = req.shop
  if (!shop) return next(new ErrorHandler('Shop not found.', 404))

  const allowed = [
    'name',
    'description',
    'email',
    'phone',
    'address',
    'city',
    'country',
    'payout_method',
    'payout_account',
  ]

  const updates = []
  const values = []
  let i = 1

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates.push(`${key} = $${i}`)
      values.push(typeof req.body[key] === 'string' ? sanitize(req.body[key]) : req.body[key])
      i++
    }
  }

  // Optional logo upload
  if (req.files?.logo) {
    const file = Array.isArray(req.files.logo) ? req.files.logo[0] : req.files.logo
    const uploadError = validateImageUpload(file)
    if (uploadError) return next(new ErrorHandler(uploadError, 400))
    const uploaded = await cloudinary.uploader.upload(file.tempFilePath, {
      folder: 'Ecommerce_Shop_Logos',
      width: 400,
      crop: 'scale',
    })
    await deleteTempFiles([file.tempFilePath])
    updates.push(`logo = $${i}`)
    values.push(JSON.stringify({ url: uploaded.secure_url, public_id: uploaded.public_id }))
    i++
  }

  if (req.files?.banner) {
    const file = Array.isArray(req.files.banner) ? req.files.banner[0] : req.files.banner
    const uploadError = validateImageUpload(file)
    if (uploadError) return next(new ErrorHandler(uploadError, 400))
    const uploaded = await cloudinary.uploader.upload(file.tempFilePath, {
      folder: 'Ecommerce_Shop_Banners',
      width: 1600,
      crop: 'scale',
    })
    await deleteTempFiles([file.tempFilePath])
    updates.push(`banner = $${i}`)
    values.push(JSON.stringify({ url: uploaded.secure_url, public_id: uploaded.public_id }))
    i++
  }

  if (!updates.length) {
    return next(new ErrorHandler('No fields to update.', 400))
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`)
  values.push(shop.id)

  const result = await database.query(
    `UPDATE shops SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
    values,
  )

  res.status(200).json({
    success: true,
    message: 'Shop updated.',
    shop: normalizeShop(result.rows[0]),
  })
})

// ─── Vendor products ─────────────────────────────────────────────────────────

export const getVendorProducts = catchAsyncErrors(async (req, res, next) => {
  if (!req.shop) return next(new ErrorHandler('Shop required.', 400))

  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20))
  const offset = (page - 1) * limit
  const search = req.query.search ? `%${sanitize(req.query.search)}%` : null

  let where = 'WHERE shop_id = $1'
  const values = [req.shop.id]
  if (search) {
    values.push(search)
    where += ` AND (name ILIKE $2 OR sku ILIKE $2)`
  }

  const countRes = await database.query(`SELECT COUNT(*) FROM products ${where}`, values)
  const limIdx = values.length + 1
  const offIdx = values.length + 2
  values.push(limit, offset)

  const result = await database.query(
    `SELECT * FROM products ${where}
     ORDER BY created_at DESC
     LIMIT $${limIdx} OFFSET $${offIdx}`,
    values,
  )

  res.status(200).json({
    success: true,
    products: result.rows,
    pagination: {
      page,
      limit,
      total: parseInt(countRes.rows[0].count),
      pages: Math.ceil(parseInt(countRes.rows[0].count) / limit),
    },
  })
})

export const createVendorProduct = catchAsyncErrors(async (req, res, next) => {
  if (!req.shop) return next(new ErrorHandler('Shop required.', 400))

  let { name, description, price, category, stock } = req.body
  name = sanitize(name)
  description = sanitize(description)
  category = category ? sanitize(category) : 'Uncategorized'

  if (!name || !description || price === undefined || stock === undefined) {
    return next(new ErrorHandler('name, description, price, and stock are required.', 400))
  }

  const numPrice = parseFloat(price)
  const numStock = parseInt(stock, 10)
  if (isNaN(numPrice) || numPrice < 0 || isNaN(numStock) || numStock < 0) {
    return next(new ErrorHandler('Invalid price or stock.', 400))
  }

  let subcategory_id = null
  let subcategory = null
  try {
    const { resolveSubcategoryFields } = await import('../utils/productTaxonomy.js')
    const resolved = await resolveSubcategoryFields(
      req.body.subcategory_id || req.body.subcategoryId || null,
      category,
    )
    subcategory_id = resolved.subcategory_id
    subcategory = resolved.subcategory
  } catch (taxErr) {
    if (taxErr.statusCode) return next(new ErrorHandler(taxErr.message, taxErr.statusCode))
    throw taxErr
  }

  let uploadedImages = []
  const tempPaths = []
  if (req.files?.images) {
    const images = Array.isArray(req.files.images) ? req.files.images : [req.files.images]
    for (const image of images.slice(0, 8)) {
      const uploadError = validateImageUpload(image)
      if (uploadError) {
        return next(new ErrorHandler(uploadError, 400))
      }
      const result = await cloudinary.uploader.upload(image.tempFilePath, {
        folder: 'Ecommerce_Product_Images',
        width: 1000,
        crop: 'scale',
      })
      uploadedImages.push({ url: result.secure_url, public_id: result.public_id })
      tempPaths.push(image.tempFilePath)
    }
    await deleteTempFiles(tempPaths)
  }

  const sku = req.body.sku ? sanitize(req.body.sku) : null
  const brand = req.body.brand ? sanitize(req.body.brand) : null
  const salePrice = req.body.sale_price ? parseFloat(req.body.sale_price) : null

  const result = await database.query(
    `INSERT INTO products (
      name, description, price, sale_price, category, stock, images,
      created_by, shop_id, brand, sku, short_description, visibility,
      subcategory_id, subcategory
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'public',$13,$14)
    RETURNING *`,
    [
      name,
      description,
      numPrice,
      salePrice,
      category,
      numStock,
      JSON.stringify(uploadedImages),
      req.user.id,
      req.shop.id,
      brand,
      sku,
      req.body.short_description ? sanitize(req.body.short_description) : null,
      subcategory_id,
      subcategory,
    ],
  )

  await database.query(
    `UPDATE shops SET product_count = product_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [req.shop.id],
  )

  if (req.io) {
    req.io.emit('products:changed', {
      action: 'created',
      product: result.rows[0],
      timestamp: new Date().toISOString(),
    })
  }

  res.status(201).json({
    success: true,
    message: 'Product listed in your shop.',
    product: result.rows[0],
  })
})

export const updateVendorProduct = catchAsyncErrors(async (req, res, next) => {
  const productId = req.params.productId
  const fields = [
    'name',
    'description',
    'short_description',
    'price',
    'sale_price',
    'category',
    'stock',
    'brand',
    'sku',
    'visibility',
    'subcategory_id',
    'subcategory',
  ]

  const updates = []
  const values = []
  let i = 1

  // If subcategory_id sent, resolve display name
  if (req.body.subcategory_id) {
    try {
      const { resolveSubcategoryFields } = await import('../utils/productTaxonomy.js')
      const resolved = await resolveSubcategoryFields(req.body.subcategory_id, req.body.category)
      req.body.subcategory_id = resolved.subcategory_id
      req.body.subcategory = resolved.subcategory
    } catch (taxErr) {
      if (taxErr.statusCode) return next(new ErrorHandler(taxErr.message, taxErr.statusCode))
      throw taxErr
    }
  }

  for (const key of fields) {
    if (req.body[key] !== undefined) {
      let val = req.body[key]
      if (typeof val === 'string') val = sanitize(val)
      if (key === 'price' || key === 'sale_price') val = parseFloat(val)
      if (key === 'stock') val = parseInt(val, 10)
      updates.push(`${key} = $${i}`)
      values.push(val)
      i++
    }
  }

  if (req.files?.images) {
    const images = Array.isArray(req.files.images) ? req.files.images : [req.files.images]
    const uploaded = []
    const temps = []
    for (const image of images.slice(0, 8)) {
      const uploadError = validateImageUpload(image)
      if (uploadError) {
        return next(new ErrorHandler(uploadError, 400))
      }
      const up = await cloudinary.uploader.upload(image.tempFilePath, {
        folder: 'Ecommerce_Product_Images',
        width: 1000,
        crop: 'scale',
      })
      uploaded.push({ url: up.secure_url, public_id: up.public_id })
      temps.push(image.tempFilePath)
    }
    await deleteTempFiles(temps)
    updates.push(`images = $${i}`)
    values.push(JSON.stringify(uploaded))
    i++
  }

  if (!updates.length) {
    return next(new ErrorHandler('No fields to update.', 400))
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`)
  values.push(productId, req.shop.id)

  const result = await database.query(
    `UPDATE products SET ${updates.join(', ')}
     WHERE id = $${i} AND shop_id = $${i + 1}
     RETURNING *`,
    values,
  )

  if (!result.rows[0]) {
    return next(new ErrorHandler('Product not found in your shop.', 404))
  }

  res.status(200).json({
    success: true,
    message: 'Product updated.',
    product: result.rows[0],
  })
})

export const deleteVendorProduct = catchAsyncErrors(async (req, res, next) => {
  const result = await database.query(
    `DELETE FROM products WHERE id = $1 AND shop_id = $2 RETURNING id`,
    [req.params.productId, req.shop.id],
  )
  if (!result.rows[0]) {
    return next(new ErrorHandler('Product not found in your shop.', 404))
  }

  await database.query(
    `UPDATE shops SET product_count = GREATEST(product_count - 1, 0), updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [req.shop.id],
  )

  res.status(200).json({ success: true, message: 'Product deleted.' })
})

// ─── Vendor orders ───────────────────────────────────────────────────────────

export const getVendorOrders = catchAsyncErrors(async (req, res, next) => {
  if (!req.shop) return next(new ErrorHandler('Shop required.', 400))

  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20))
  const offset = (page - 1) * limit
  const status = req.query.status

  let where = 'WHERE vo.shop_id = $1'
  const values = [req.shop.id]
  if (status) {
    values.push(status)
    where += ` AND vo.status = $${values.length}`
  }

  const countRes = await database.query(
    `SELECT COUNT(*) FROM vendor_orders vo ${where}`,
    values,
  )

  const limIdx = values.length + 1
  const offIdx = values.length + 2
  values.push(limit, offset)
  const result = await database.query(
    `SELECT vo.*,
            o.buyer_id, o.created_at AS order_created_at,
            o.total_price AS parent_total,
            u.name AS buyer_name, u.email AS buyer_email,
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
     JOIN orders o ON o.id = vo.order_id
     LEFT JOIN users u ON u.id = o.buyer_id
     ${where}
     ORDER BY vo.created_at DESC
     LIMIT $${limIdx} OFFSET $${offIdx}`,
    values,
  )

  res.status(200).json({
    success: true,
    orders: result.rows,
    pagination: {
      page,
      limit,
      total: parseInt(countRes.rows[0].count),
    },
  })
})

export const updateVendorOrderStatus = catchAsyncErrors(async (req, res, next) => {
  const { status, tracking_number, vendor_note, carrier, estimated_delivery } = req.body
  const allowed = ['Processing', 'Shipped', 'Delivered', 'Cancelled']

  if (!status || !allowed.includes(status)) {
    return next(new ErrorHandler(`Status must be one of: ${allowed.join(', ')}`, 400))
  }

  if (status === 'Shipped' && !tracking_number && !req.body.allow_no_tracking) {
    // Soft requirement — allow but prefer tracking
  }

  const existing = await database.query(
    `SELECT * FROM vendor_orders WHERE id = $1 AND shop_id = $2`,
    [req.params.vendorOrderId, req.shop.id],
  )
  if (!existing.rows[0]) {
    return next(new ErrorHandler('Vendor order not found.', 404))
  }

  const current = existing.rows[0].status
  // Simple state machine — no going backwards except cancel from Processing
  const transitions = {
    Processing: ['Shipped', 'Cancelled'],
    Shipped: ['Delivered', 'Cancelled'],
    Delivered: [],
    Cancelled: [],
  }
  if (!transitions[current]?.includes(status) && current !== status) {
    return next(
      new ErrorHandler(`Cannot change status from ${current} to ${status}.`, 400),
    )
  }

  const eta =
    estimated_delivery && !Number.isNaN(Date.parse(estimated_delivery))
      ? new Date(estimated_delivery)
      : null

  const result = await withTransaction(async (tx) => {
    // Only mark eligible when Delivered; wallet credit requires Paid as well
    const updated = await tx.query(
      `UPDATE vendor_orders SET
         status = $1,
         tracking_number = COALESCE($2, tracking_number),
         vendor_note = COALESCE($3, vendor_note),
         carrier = COALESCE($4, carrier),
         estimated_delivery = COALESCE($5, estimated_delivery),
         shipped_at = CASE
           WHEN $1 = 'Shipped' AND shipped_at IS NULL THEN CURRENT_TIMESTAMP
           ELSE shipped_at
         END,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 AND shop_id = $7
       RETURNING *`,
      [
        status,
        tracking_number ? sanitize(tracking_number) : null,
        vendor_note ? sanitize(vendor_note) : null,
        carrier ? sanitize(String(carrier).slice(0, 60)) : null,
        eta,
        req.params.vendorOrderId,
        req.shop.id,
      ],
    )

    const vendorOrder = updated.rows[0]

    if (status === 'Delivered' && current !== 'Delivered') {
      await creditVendorOrderEarning(tx, vendorOrder.id, req.user.id)
    }

    // Restore inventory + reverse shop counters when cancelling
    if (status === 'Cancelled' && current !== 'Cancelled') {
      const items = await tx.query(
        `SELECT product_id, quantity FROM order_items WHERE vendor_order_id = $1`,
        [vendorOrder.id],
      )
      for (const item of items.rows) {
        await tx.query(`UPDATE products SET stock = stock + $1 WHERE id = $2`, [
          item.quantity,
          item.product_id,
        ])
        await tx.query(
          `UPDATE inventory_reservations SET status = 'released'
           WHERE order_id = $1 AND product_id = $2 AND status = 'active'`,
          [vendorOrder.order_id, item.product_id],
        )
      }

      const payment = await tx.query(
        `SELECT payment_status FROM payments WHERE order_id = $1`,
        [vendorOrder.order_id],
      )
      const wasPaid = payment.rows[0]?.payment_status === 'Paid'
      const subtotal = parseFloat(vendorOrder.subtotal) || 0

      await tx.query(
        `UPDATE shops SET
           total_orders = GREATEST(total_orders - 1, 0),
           total_sales = CASE
             WHEN $3 THEN GREATEST(total_sales - $1, 0)
             ELSE total_sales
           END,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [subtotal, req.shop.id, wasPaid],
      )

      // Reverse wallet credit if this order was already credited
      const credited = await tx.query(
        `SELECT id, amount FROM vendor_wallet_transactions
         WHERE vendor_order_id = $1 AND type = 'earning_credit'`,
        [vendorOrder.id],
      )
      if (credited.rows[0]) {
        const amt = parseFloat(credited.rows[0].amount)
        const shopBal = await tx.query(
          `SELECT wallet_balance FROM shops WHERE id = $1 FOR UPDATE`,
          [req.shop.id],
        )
        const balance = parseFloat(shopBal.rows[0]?.wallet_balance || 0)
        const balanceAfter = Math.round(Math.max(balance - amt, 0) * 100) / 100
        await tx.query(
          `UPDATE shops SET wallet_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [balanceAfter, req.shop.id],
        )
        await tx.query(
          `INSERT INTO vendor_wallet_transactions
             (shop_id, vendor_order_id, type, amount, direction, balance_after, note, created_by)
           VALUES ($1, $2, 'refund_debit', $3, 'debit', $4, $5, $6)`,
          [
            req.shop.id,
            vendorOrder.id,
            amt,
            balanceAfter,
            `Refund debit for cancelled vendor order ${vendorOrder.id}`,
            req.user.id,
          ],
        )
        await tx.query(
          `UPDATE vendor_orders SET payout_status = 'pending', updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [vendorOrder.id],
        )
      }
    }

    // Sync parent order status when all vendor orders agree
    const siblings = await tx.query(`SELECT status FROM vendor_orders WHERE order_id = $1`, [
      vendorOrder.order_id,
    ])
    const statuses = siblings.rows.map((r) => r.status)
    let parentStatus = null
    if (statuses.every((s) => s === 'Cancelled')) parentStatus = 'Cancelled'
    else if (statuses.every((s) => s === 'Delivered' || s === 'Cancelled'))
      parentStatus = 'Delivered'
    else if (statuses.some((s) => s === 'Shipped' || s === 'Delivered')) parentStatus = 'Shipped'

    if (parentStatus) {
      await tx.query(`UPDATE orders SET order_status = $1 WHERE id = $2`, [
        parentStatus,
        vendorOrder.order_id,
      ])
    }

    return vendorOrder
  })

  res.status(200).json({
    success: true,
    message: 'Order status updated.',
    vendorOrder: result,
  })
})

// ─── Vendor dashboard analytics ──────────────────────────────────────────────

export const getVendorDashboard = catchAsyncErrors(async (req, res, next) => {
  if (!req.shop) return next(new ErrorHandler('Shop required.', 400))
  const shopId = req.shop.id

  const [stats, recentOrders, topProducts, earnings] = await Promise.all([
    database.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'Processing') AS pending_orders,
         COUNT(*) FILTER (WHERE status = 'Shipped') AS shipped_orders,
         COUNT(*) FILTER (WHERE status = 'Delivered') AS delivered_orders,
         COALESCE(SUM(vendor_earning) FILTER (WHERE payout_status = 'eligible'), 0) AS pending_payout,
         COALESCE(SUM(vendor_earning) FILTER (WHERE payout_status = 'paid'), 0) AS paid_out,
         COALESCE(SUM(subtotal), 0) AS gross_sales
       FROM vendor_orders WHERE shop_id = $1`,
      [shopId],
    ),
    database.query(
      `SELECT vo.id, vo.status, vo.subtotal, vo.vendor_earning, vo.created_at,
              u.name AS buyer_name
       FROM vendor_orders vo
       JOIN orders o ON o.id = vo.order_id
       LEFT JOIN users u ON u.id = o.buyer_id
       WHERE vo.shop_id = $1
       ORDER BY vo.created_at DESC LIMIT 8`,
      [shopId],
    ),
    database.query(
      `SELECT p.id, p.name, p.stock, p.price, p.images,
              COALESCE(SUM(oi.quantity), 0)::INT AS sold
       FROM products p
       LEFT JOIN order_items oi ON oi.product_id = p.id
       WHERE p.shop_id = $1
       GROUP BY p.id
       ORDER BY sold DESC
       LIMIT 5`,
      [shopId],
    ),
    database.query(
      `SELECT DATE(created_at) AS day,
              COALESCE(SUM(vendor_earning), 0) AS earning,
              COUNT(*) AS orders
       FROM vendor_orders
       WHERE shop_id = $1 AND created_at >= NOW() - INTERVAL '14 days'
       GROUP BY DATE(created_at)
       ORDER BY day ASC`,
      [shopId],
    ),
  ])

  res.status(200).json({
    success: true,
    shop: normalizeShop(req.shop),
    stats: stats.rows[0],
    recentOrders: recentOrders.rows,
    topProducts: topProducts.rows,
    earningsTrend: earnings.rows,
  })
})

/** Richer seller analytics for Seller Hub */
export const getVendorAnalytics = catchAsyncErrors(async (req, res, next) => {
  if (!req.shop) return next(new ErrorHandler('Shop required.', 400))
  const shopId = req.shop.id
  const days = Math.min(90, Math.max(7, parseInt(req.query.days) || 30))

  const [summary, trend, topProducts, categoryMix, lowStock, fulfillment] = await Promise.all([
    database.query(
      `SELECT
         COALESCE(SUM(subtotal) FILTER (WHERE status != 'Cancelled'), 0) AS gmv,
         COALESCE(SUM(vendor_earning) FILTER (WHERE status != 'Cancelled'), 0) AS net_earnings,
         COALESCE(SUM(commission_amount) FILTER (WHERE status != 'Cancelled'), 0) AS commission_paid,
         COUNT(*) FILTER (WHERE status != 'Cancelled') AS orders_count,
         COUNT(*) FILTER (WHERE status = 'Delivered') AS delivered_count,
         COUNT(*) FILTER (WHERE status = 'Cancelled') AS cancelled_count,
         COALESCE(AVG(subtotal) FILTER (WHERE status != 'Cancelled'), 0) AS aov
       FROM vendor_orders
       WHERE shop_id = $1 AND created_at >= NOW() - ($2 * INTERVAL '1 day')`,
      [shopId, days],
    ),
    database.query(
      `SELECT DATE(created_at) AS day,
              COALESCE(SUM(subtotal) FILTER (WHERE status != 'Cancelled'), 0) AS gmv,
              COALESCE(SUM(vendor_earning) FILTER (WHERE status != 'Cancelled'), 0) AS earning,
              COUNT(*) FILTER (WHERE status != 'Cancelled') AS orders
       FROM vendor_orders
       WHERE shop_id = $1 AND created_at >= NOW() - ($2 * INTERVAL '1 day')
       GROUP BY DATE(created_at)
       ORDER BY day ASC`,
      [shopId, days],
    ),
    database.query(
      `SELECT p.id, p.name, p.stock, p.price, p.images, p.category, p.subcategory,
              COALESCE(SUM(oi.quantity), 0)::INT AS units_sold,
              COALESCE(SUM(oi.quantity * oi.price), 0) AS revenue
       FROM products p
       LEFT JOIN order_items oi ON oi.product_id = p.id
       LEFT JOIN vendor_orders vo ON vo.id = oi.vendor_order_id AND vo.status != 'Cancelled'
       WHERE p.shop_id = $1
       GROUP BY p.id
       ORDER BY units_sold DESC
       LIMIT 10`,
      [shopId],
    ),
    database.query(
      `SELECT COALESCE(p.category, 'Uncategorized') AS category,
              COUNT(DISTINCT p.id)::INT AS products,
              COALESCE(SUM(oi.quantity), 0)::INT AS units_sold
       FROM products p
       LEFT JOIN order_items oi ON oi.product_id = p.id AND oi.shop_id = $1
       WHERE p.shop_id = $1
       GROUP BY COALESCE(p.category, 'Uncategorized')
       ORDER BY units_sold DESC
       LIMIT 8`,
      [shopId],
    ),
    database.query(
      `SELECT id, name, stock, low_stock_threshold, price
       FROM products
       WHERE shop_id = $1 AND stock <= COALESCE(low_stock_threshold, 10)
       ORDER BY stock ASC
       LIMIT 10`,
      [shopId],
    ),
    database.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'Processing') AS processing,
         COUNT(*) FILTER (WHERE status = 'Shipped') AS shipped,
         COUNT(*) FILTER (WHERE status = 'Delivered') AS delivered,
         COUNT(*) FILTER (WHERE status = 'Cancelled') AS cancelled
       FROM vendor_orders
       WHERE shop_id = $1 AND created_at >= NOW() - ($2 || ' days')::INTERVAL`,
      [shopId, String(days)],
    ),
  ])

  const s = summary.rows[0] || {}
  const delivered = parseInt(s.delivered_count || 0)
  const orders = parseInt(s.orders_count || 0)

  res.status(200).json({
    success: true,
    period_days: days,
    summary: {
      gmv: parseFloat(s.gmv || 0),
      net_earnings: parseFloat(s.net_earnings || 0),
      commission_paid: parseFloat(s.commission_paid || 0),
      orders_count: orders,
      delivered_count: delivered,
      cancelled_count: parseInt(s.cancelled_count || 0),
      aov: parseFloat(s.aov || 0),
      fulfillment_rate: orders > 0 ? Math.round((delivered / orders) * 1000) / 10 : 0,
      wallet_balance: parseFloat(req.shop.wallet_balance || 0),
    },
    trend: trend.rows,
    topProducts: topProducts.rows,
    categoryMix: categoryMix.rows,
    lowStock: lowStock.rows,
    fulfillment: fulfillment.rows[0],
  })
})

// ─── Public shop storefront ──────────────────────────────────────────────────

export const listPublicShops = catchAsyncErrors(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(40, Math.max(1, parseInt(req.query.limit) || 12))
  const offset = (page - 1) * limit
  const search = req.query.search ? `%${sanitize(req.query.search)}%` : null

  let where = `WHERE status = 'approved'`
  const values = []
  if (search) {
    values.push(search)
    where += ` AND (name ILIKE $1 OR description ILIKE $1 OR city ILIKE $1)`
  }

  const countRes = await database.query(`SELECT COUNT(*) FROM shops ${where}`, values)
  values.push(limit, offset)

  const result = await database.query(
    `SELECT * FROM shops ${where}
     ORDER BY is_verified DESC, rating DESC, total_orders DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  )

  res.status(200).json({
    success: true,
    shops: result.rows.map(publicShopFields),
    pagination: {
      page,
      limit,
      total: parseInt(countRes.rows[0].count),
    },
  })
})

export const getPublicShop = catchAsyncErrors(async (req, res, next) => {
  const { slug } = req.params
  const result = await database.query(
    `SELECT * FROM shops WHERE slug = $1 AND status = 'approved'`,
    [slug],
  )
  if (!result.rows[0]) {
    return next(new ErrorHandler('Shop not found.', 404))
  }

  const shop = result.rows[0]
  const products = await database.query(
    `SELECT id, name, price, sale_price, images, rating, stock, category, brand, slug
     FROM products
     WHERE shop_id = $1 AND (visibility = 'public' OR visibility = 'visible' OR visibility IS NULL)
     ORDER BY featured DESC, created_at DESC
     LIMIT 48`,
    [shop.id],
  )

  res.status(200).json({
    success: true,
    shop: publicShopFields(shop),
    products: products.rows,
  })
})

// ─── Admin: shop moderation ──────────────────────────────────────────────────

export const adminListShops = catchAsyncErrors(async (req, res) => {
  const status = req.query.status
  const values = []
  let where = ''
  if (status) {
    values.push(status)
    where = 'WHERE s.status = $1'
  }

  const result = await database.query(
    `SELECT s.*, u.name AS owner_name, u.email AS owner_email, u.mobile AS owner_mobile
     FROM shops s
     JOIN users u ON u.id = s.owner_id
     ${where}
     ORDER BY s.created_at DESC`,
    values,
  )

  res.status(200).json({
    success: true,
    shops: result.rows.map(normalizeShop),
  })
})

export const adminUpdateShopStatus = catchAsyncErrors(async (req, res, next) => {
  const { status, commission_rate, rejection_reason, is_verified } = req.body
  const allowed = ['pending', 'approved', 'suspended', 'rejected']

  if (status && !allowed.includes(status)) {
    return next(new ErrorHandler('Invalid shop status.', 400))
  }

  const shop = await database.query('SELECT * FROM shops WHERE id = $1', [req.params.shopId])
  if (!shop.rows[0]) return next(new ErrorHandler('Shop not found.', 404))

  // Soft gate: verifying a shop should follow KYC approval when KYC was submitted
  if (
    status === 'approved' &&
    is_verified === true &&
    shop.rows[0].kyc_status &&
    shop.rows[0].kyc_status !== 'not_submitted' &&
    shop.rows[0].kyc_status !== 'approved'
  ) {
    return next(
      new ErrorHandler(
        'Approve KYC before marking this seller as verified (or approve without is_verified).',
        400,
      ),
    )
  }

  const result = await database.query(
    `UPDATE shops SET
       status = COALESCE($1, status),
       commission_rate = COALESCE($2, commission_rate),
       rejection_reason = COALESCE($3, rejection_reason),
       is_verified = COALESCE($4, is_verified),
       approved_at = CASE WHEN $1 = 'approved' THEN CURRENT_TIMESTAMP ELSE approved_at END,
       approved_by = CASE WHEN $1 = 'approved' THEN $5 ELSE approved_by END,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $6
     RETURNING *`,
    [
      status || null,
      commission_rate != null ? parseFloat(commission_rate) : null,
      rejection_reason ? sanitize(rejection_reason) : null,
      typeof is_verified === 'boolean' ? is_verified : null,
      req.user.id,
      req.params.shopId,
    ],
  )

  res.status(200).json({
    success: true,
    message: `Shop ${status || 'updated'}.`,
    shop: normalizeShop(result.rows[0]),
  })
})

export { publicShopFields, normalizeShop }
