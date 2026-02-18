import ErrorHandler from '../middlewares/errorMiddleware.js'
import { catchAsyncErrors } from '../middlewares/catchAsyncError.js'
import database from '../database/db.js'

/**
 * Get user's wishlist
 * GET /product/wishlist
 */
export const getWishlist = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user.id

  const result = await database.query(
    `SELECT p.*, w.created_at as wishlisted_at
     FROM wishlist_items w
     JOIN products p ON w.product_id = p.id
     WHERE w.user_id = $1
     ORDER BY w.created_at DESC`,
    [userId],
  )

  res.status(200).json({
    success: true,
    data: result.rows,
    count: result.rows.length,
  })
})

/**
 * Add product to wishlist
 * POST /product/wishlist/:productId
 */
export const addToWishlist = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user.id
  const { productId } = req.params

  // Check if product exists
  const productExists = await database.query(`SELECT id FROM products WHERE id = $1`, [productId])

  if (productExists.rows.length === 0) {
    return next(new ErrorHandler('Product not found.', 404))
  }

  // Check if already in wishlist
  const alreadyWishlisted = await database.query(
    `SELECT id FROM wishlist_items WHERE user_id = $1 AND product_id = $2`,
    [userId, productId],
  )

  if (alreadyWishlisted.rows.length > 0) {
    return next(new ErrorHandler('Product already in wishlist.', 400))
  }

  // Add to wishlist
  const result = await database.query(
    `INSERT INTO wishlist_items (user_id, product_id)
     VALUES ($1, $2)
     RETURNING *`,
    [userId, productId],
  )

  res.status(201).json({
    success: true,
    message: 'Product added to wishlist.',
    data: result.rows[0],
  })
})

/**
 * Remove product from wishlist
 * DELETE /product/wishlist/:productId
 */
export const removeFromWishlist = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user.id
  const { productId } = req.params

  const result = await database.query(
    `DELETE FROM wishlist_items
     WHERE user_id = $1 AND product_id = $2
     RETURNING id`,
    [userId, productId],
  )

  if (result.rows.length === 0) {
    return next(new ErrorHandler('Item not in wishlist.', 404))
  }

  res.status(200).json({
    success: true,
    message: 'Product removed from wishlist.',
  })
})

/**
 * Check if product is in wishlist
 * GET /product/wishlist/:productId
 */
export const isInWishlist = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user.id
  const { productId } = req.params

  const result = await database.query(
    `SELECT id FROM wishlist_items WHERE user_id = $1 AND product_id = $2`,
    [userId, productId],
  )

  res.status(200).json({
    success: true,
    isInWishlist: result.rows.length > 0,
  })
})

/**
 * Clear wishlist
 * DELETE /product/wishlist
 */
export const clearWishlist = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user.id

  await database.query(`DELETE FROM wishlist_items WHERE user_id = $1`, [userId])

  res.status(200).json({
    success: true,
    message: 'Wishlist cleared successfully.',
  })
})
