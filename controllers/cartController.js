import ErrorHandler from '../middlewares/errorMiddleware.js'
import { catchAsyncErrors } from '../middlewares/catchAsyncError.js'
import database from '../database/db.js'

/**
 * Get user's cart
 * GET /order/cart
 */
export const getCart = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user.id

  const result = await database.query(
    `SELECT c.*, p.id, p.name, p.price, p.images, p.category, p.stock
     FROM cart_items c
     JOIN products p ON c.product_id = p.id
     WHERE c.user_id = $1
     ORDER BY c.created_at DESC`,
    [userId],
  )

  // Calculate totals
  const items = result.rows.map((row) => ({
    id: row.product_id,
    quantity: row.quantity,
    name: row.name,
    price: parseFloat(row.price),
    images: row.images,
    category: row.category,
    stock: row.stock,
  }))

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)

  res.status(200).json({
    success: true,
    data: {
      items,
      subtotal,
      itemCount: items.length,
    },
  })
})

/**
 * Add product to cart
 * POST /order/cart/:productId
 */
export const addToCart = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user.id
  const { productId } = req.params
  const { quantity = 1 } = req.body

  // Validate quantity
  if (!quantity || quantity < 1 || !Number.isInteger(quantity)) {
    return next(new ErrorHandler('Quantity must be a positive integer.', 400))
  }

  // Check if product exists
  const productExists = await database.query(
    `SELECT id, stock, price, name, images FROM products WHERE id = $1`,
    [productId],
  )

  if (productExists.rows.length === 0) {
    return next(new ErrorHandler('Product not found.', 404))
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
    [userId, productId],
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
       RETURNING *`,
      [newQuantity, userId, productId],
    )
  } else {
    // Add new item to cart
    result = await database.query(
      `INSERT INTO cart_items (user_id, product_id, quantity)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, productId, quantity],
    )
  }

  res.status(201).json({
    success: true,
    message: 'Product added to cart.',
    data: {
      productId: result.rows[0].product_id,
      quantity: result.rows[0].quantity,
      productName: product.name,
      productPrice: parseFloat(product.price),
    },
  })
})

/**
 * Update cart item quantity
 * PUT /order/cart/:productId
 */
export const updateCartItemQuantity = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user.id
  const { productId } = req.params
  const { quantity } = req.body

  // Validate quantity
  if (!quantity || quantity < 1 || !Number.isInteger(quantity)) {
    return next(new ErrorHandler('Quantity must be a positive integer.', 400))
  }

  // Check if product exists in cart
  const cartItem = await database.query(
    `SELECT quantity FROM cart_items WHERE user_id = $1 AND product_id = $2`,
    [userId, productId],
  )

  if (cartItem.rows.length === 0) {
    return next(new ErrorHandler('Item not in cart.', 404))
  }

  // Check product stock
  const product = await database.query(`SELECT stock FROM products WHERE id = $1`, [productId])

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
     WHERE user_id = $2 AND product_id = $3
     RETURNING *`,
    [quantity, userId, productId],
  )

  res.status(200).json({
    success: true,
    message: 'Cart item updated.',
    data: {
      productId: result.rows[0].product_id,
      quantity: result.rows[0].quantity,
    },
  })
})

/**
 * Remove product from cart
 * DELETE /order/cart/:productId
 */
export const removeFromCart = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user.id
  const { productId } = req.params

  const result = await database.query(
    `DELETE FROM cart_items
     WHERE user_id = $1 AND product_id = $2
     RETURNING id`,
    [userId, productId],
  )

  if (result.rows.length === 0) {
    return next(new ErrorHandler('Item not in cart.', 404))
  }

  res.status(200).json({
    success: true,
    message: 'Product removed from cart.',
  })
})

/**
 * Clear entire cart
 * DELETE /order/cart
 */
export const clearCart = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user.id

  await database.query(`DELETE FROM cart_items WHERE user_id = $1`, [userId])

  res.status(200).json({
    success: true,
    message: 'Cart cleared successfully.',
  })
})
