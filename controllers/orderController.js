import ErrorHandler from '../middlewares/errorMiddleware.js'
import { catchAsyncErrors } from '../middlewares/catchAsyncError.js'
import database from '../database/db.js'
import { generatePaymentIntent } from '../utils/generatePaymentIntent.js'

export const placeNewOrder = catchAsyncErrors(async (req, res, next) => {
  try {
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
    } = req.body

    console.log('Order request received:', { full_name, state, city, paymentMethod })

    // Verify user is authenticated
    if (!req.user || !req.user.id) {
      return next(new ErrorHandler('User not authenticated.', 401))
    }

    if (!full_name || !state || !city || !country || !address || !pincode || !phone) {
      return next(new ErrorHandler('Please provide complete shipping details.', 400))
    }

    const items = Array.isArray(orderedItems) ? orderedItems : JSON.parse(orderedItems)

    if (!items || items.length === 0) {
      return next(new ErrorHandler('No items in cart.', 400))
    }
    const productIds = items.map((item) => item.product.id)
    const { rows: products } = await database.query(
      `SELECT id, price, stock, name FROM products WHERE id = ANY($1::uuid[])`,
      [productIds],
    )

    console.log('Found products:', products.length)

    let total_price = 0
    const values = []
    const placeholders = []

    items.forEach((item, index) => {
      const product = products.find((p) => p.id === item.product.id)

      if (!product) {
        return next(new ErrorHandler(`Product not found for ID: ${item.product.id}`, 404))
      }

      if (item.quantity > product.stock) {
        return next(
          new ErrorHandler(`Only ${product.stock} units available for ${product.name}`, 400),
        )
      }

      const itemTotal = product.price * item.quantity
      total_price += itemTotal

      // Get image URL safely - handle missing images array
      const imageUrl =
        item.product.images && item.product.images.length > 0 ? item.product.images[0].url : ''

      values.push(null, product.id, item.quantity, product.price, imageUrl, product.name)

      const offset = index * 6

      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${
          offset + 5
        }, $${offset + 6})`,
      )
    })

    // Calculate shipping based on district (from frontend)
    const district = city ? city.toLowerCase().trim() : ''
    let shipping_price = 0

    // Apply Bangladesh shipping rates
    if (district === 'chittagong' || district === 'চট্টগ্রাম') {
      shipping_price = 60 // ৳60 for Chittagong
    } else {
      shipping_price = 100 // ৳100 for other districts
    }

    // Calculate final total: subtotal + shipping (no tax)
    total_price = Math.round(total_price + shipping_price)

    const orderResult = await database.query(
      `INSERT INTO orders (buyer_id, total_price, tax_price, shipping_price) VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, total_price, 0, shipping_price],
    )

    const orderId = orderResult.rows[0].id

    for (let i = 0; i < values.length; i += 6) {
      values[i] = orderId
    }

    await database.query(
      `
    INSERT INTO order_items (order_id, product_id, quantity, price, image, title)
    VALUES ${placeholders.join(', ')} RETURNING *
    `,
      values,
    )

    // Store shipping details in database
    try {
      await database.query(
        `
        INSERT INTO shipping_info (order_id, full_name, state, city, country, address, pincode, phone)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
        `,
        [orderId, full_name, state, city, country, address, pincode, phone],
      )
      console.log('Shipping info saved for order:', orderId)
    } catch (err) {
      console.warn('Warning: Could not insert shipping info:', err.message)
    }

    // Create payment record for tracking
    try {
      await database.query(
        `INSERT INTO payments (order_id, payment_type, payment_status, payment_intent_id)
         VALUES ($1, $2, $3, $4)`,
        [orderId, paymentMethod || 'COD', 'Pending', orderId],
      )
      console.log('Payment record created for order:', orderId)
    } catch (err) {
      console.warn('Warning: Could not create payment record:', err.message)
    }

    // For COD, skip online payment gateway and just return success
    if (paymentMethod === 'COD') {
      console.log('COD Order created successfully:', orderId)
      return res.status(200).json({
        success: true,
        message: 'Order placed successfully. Payment pending on delivery.',
        order: { id: orderId },
        total_price,
      })
    }

    // For online payments, generate Stripe payment intent
    const paymentResponse = await generatePaymentIntent(orderId, total_price)

    if (!paymentResponse.success) {
      return next(new ErrorHandler('Payment failed. Try again.', 500))
    }

    res.status(200).json({
      success: true,
      message: 'Order placed successfully. Please proceed to payment.',
      paymentIntent: paymentResponse.clientSecret,
      total_price,
    })
  } catch (error) {
    console.error('Order creation error:', error.message)
    console.error('Full error:', error)
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
json_build_object(
'order_item_id', oi.id,
'order_id', oi.order_id,
'product_id', oi.product_id,
'quantity', oi.quantity,
'price', oi.price
 )
 ) FILTER (WHERE oi.id IS NOT NULL), '[]'
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
LEFT JOIN shipping_info s ON o.id = s.order_id
WHERE o.id = $1
GROUP BY o.id, s.id;
`,
    [orderId],
  )

  res.status(200).json({
    success: true,
    message: 'Order fetched.',
    orders: result.rows[0],
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
 'title', oi.title
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
p.created_at AS payment_created_at
 FROM orders o
 LEFT JOIN order_items oi ON o.id = oi.order_id
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
  const result = await database.query(`
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
GROUP BY o.id, s.id, u.id, p.id
ORDER BY o.created_at DESC
        `)

  res.status(200).json({
    success: true,
    message: 'All orders fetched.',
    orders: result.rows,
  })
})

export const updateOrderStatus = catchAsyncErrors(async (req, res, next) => {
  const { status } = req.body
  if (!status) {
    return next(new ErrorHandler('Provide a valid status for order.', 400))
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
    [status, orderId],
  )

  res.status(200).json({
    success: true,
    message: 'Order status updated.',
    updatedOrder: updatedOrder.rows[0],
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
  } else {
    await database.query(`UPDATE orders SET paid_at = NULL WHERE id = $1`, [orderId])
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
