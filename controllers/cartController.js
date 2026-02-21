import ErrorHandler from '../middlewares/errorMiddleware.js'
import { catchAsyncErrors } from '../middlewares/catchAsyncError.js'
import database from '../database/db.js'

/**
 * Get user's cart
 * GET /api/v1/customer/cart
 */
export const getCart = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user.id

  const result = await database.query(
    `SELECT c.id as cart_item_id, c.quantity, p.id as product_id, p.name, p.price, p.images, p.category, p.stock
     FROM cart_items c
     JOIN products p ON c.product_id = p.id
     WHERE c.user_id = $1
     ORDER BY c.created_at DESC`,
    [userId],
  )

  // Calculate totals
  const items = result.rows.map((row) => ({
    id: row.cart_item_id,
    product_id: row.product_id,
    quantity: row.quantity,
    name: row.name,
    price: parseFloat(row.price),
    image: row.images && row.images.length > 0 ? row.images[0] : null,
    category: row.category,
    stock: row.stock,
  }))

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)

  console.log(`✅ [CART] Retrieved ${items.length} items for user ${userId}`)

  res.status(200).json({
    success: true,
    message: 'Cart retrieved successfully',
    data: {
      items,
      subtotal,
      itemCount: items.length,
    },
    timestamp: new Date(),
  })
})

/**
 * Add product to cart
 * POST /api/v1/customer/cart
 * Body: { product_id, quantity }
 */
export const addToCart = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user.id
  const { product_id, quantity = 1 } = req.body

  // Validate input
  if (!product_id) {
    return next(new ErrorHandler('Product ID is required', 400))
  }

  // Validate quantity
  if (!quantity || quantity < 1 || !Number.isInteger(quantity)) {
    return next(new ErrorHandler('Quantity must be a positive integer', 400))
  }

  // Check if product exists
  const productExists = await database.query(
    `SELECT id, stock, price, name FROM products WHERE id = $1`,
    [product_id],
  )

  if (productExists.rows.length === 0) {
    return next(new ErrorHandler('Product not found', 404))
  }

  const product = productExists.rows[0]

  // Check stock
  if (product.stock < quantity) {
    return next(
      new ErrorHandler(
        `Not enough stock. Available: ${product.stock}, Requested: ${quantity}`,
        400,
      ),
    )
  }

  // Check if already in cart
  const alreadyInCart = await database.query(
    `SELECT id, quantity FROM cart_items WHERE user_id = $1 AND product_id = $2`,
    [userId, product_id],
  )

  let result
  if (alreadyInCart.rows.length > 0) {
    // Update quantity
    const newQuantity = alreadyInCart.rows[0].quantity + quantity
    if (newQuantity > product.stock) {
      return next(
        new ErrorHandler(
          `Not enough stock. Available: ${product.stock}, Total: ${newQuantity}`,
          400,
        ),
      )
    }

    result = await database.query(
      `UPDATE cart_items SET quantity = $1, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2 AND product_id = $3
       RETURNING id`,
      [newQuantity, userId, product_id],
    )
  } else {
    // Add new item to cart
    result = await database.query(
      `INSERT INTO cart_items (user_id, product_id, quantity, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       RETURNING id`,
      [userId, product_id, quantity],
    )
  }

  console.log(`✅ [CART] Product ${product_id} added to cart for user ${userId}`)

  res.status(201).json({
    success: true,
    message: 'Product added to cart successfully',
    data: {
      id: result.rows[0].id,
      product_id,
      quantity:
        alreadyInCart.rows.length > 0 ? alreadyInCart.rows[0].quantity + quantity : quantity,
      name: product.name,
      price: parseFloat(product.price),
    },
    timestamp: new Date(),
  })
})

/**
 * Update cart item quantity
 * PUT /api/v1/customer/cart/:item_id
 * Body: { quantity }
 */
export const updateCartItem = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user.id
  const { item_id } = req.params
  const { quantity } = req.body

  // Validate quantity
  if (!quantity || quantity < 1 || !Number.isInteger(quantity)) {
    return next(new ErrorHandler('Quantity must be a positive integer', 400))
  }

  // Check if cart item exists and belongs to user
  const cartItem = await database.query(
    `SELECT product_id FROM cart_items WHERE id = $1 AND user_id = $2`,
    [item_id, userId],
  )

  if (cartItem.rows.length === 0) {
    return next(new ErrorHandler('Cart item not found', 404))
  }

  const { product_id } = cartItem.rows[0]

  // Check product stock
  const product = await database.query(`SELECT stock FROM products WHERE id = $1`, [product_id])

  if (product.rows[0].stock < quantity) {
    return next(
      new ErrorHandler(
        `Not enough stock. Available: ${product.rows[0].stock}, Requested: ${quantity}`,
        400,
      ),
    )
  }

  const result = await database.query(
    `UPDATE cart_items SET quantity = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING id, quantity`,
    [quantity, item_id],
  )

  console.log(`✅ [CART] Cart item ${item_id} updated for user ${userId}`)

  res.status(200).json({
    success: true,
    message: 'Cart item updated successfully',
    data: result.rows[0],
    timestamp: new Date(),
  })
})

/**
 * Remove product from cart
 * DELETE /api/v1/customer/cart/:item_id
 */
export const removeFromCart = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user.id
  const { item_id } = req.params

  // Check if cart item exists and belongs to user
  const result = await database.query(
    `DELETE FROM cart_items
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [item_id, userId],
  )

  if (result.rows.length === 0) {
    return next(new ErrorHandler('Cart item not found', 404))
  }

  console.log(`✅ [CART] Item removed from cart for user ${userId}`)

  res.status(200).json({
    success: true,
    message: 'Product removed from cart successfully',
    timestamp: new Date(),
  })
})

/**
 * Clear entire cart
 * DELETE /api/v1/customer/cart
 */
export const clearCart = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user.id

  await database.query(`DELETE FROM cart_items WHERE user_id = $1`, [userId])

  console.log(`✅ [CART] Cart cleared for user ${userId}`)

  res.status(200).json({
    success: true,
    message: 'Cart cleared successfully',
    timestamp: new Date(),
  })
})
