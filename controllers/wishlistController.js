import ErrorHandler from '../middlewares/errorMiddleware.js'
import { catchAsyncErrors } from '../middlewares/catchAsyncError.js'
import database from '../database/db.js'

/**
 * Get user's wishlist
 * GET /api/v1/customer/wishlist
 */
export const getWishlist = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user.id

  const result = await database.query(
    `SELECT w.id, w.product_id, p.name, p.price, p.images, p.category, p.ratings, p.stock, w.created_at
     FROM wishlist_items w
     JOIN products p ON w.product_id = p.id
     WHERE w.user_id = $1
     ORDER BY w.created_at DESC`,
    [userId],
  )

  const items = result.rows.map((row) => ({
    ...row,
    image: row.images && row.images.length > 0 ? row.images[0] : null,
    images: undefined, // Remove the images array
  }))

  console.log(`✅ [WISHLIST] Retrieved ${items.length} items for user ${userId}`)

  res.status(200).json({
    success: true,
    message: 'Wishlist retrieved successfully',
    data: items,
    count: items.length,
    timestamp: new Date(),
  })
})

/**
 * Add product to wishlist
 * POST /api/v1/customer/wishlist
 * Body: { product_id }
 */
export const addToWishlist = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user.id
  const { product_id } = req.body

  if (!product_id) {
    return next(new ErrorHandler('Product ID is required', 400))
  }

  // Check if product exists
  const productExists = await database.query(`SELECT id FROM products WHERE id = $1`, [product_id])

  if (productExists.rows.length === 0) {
    return next(new ErrorHandler('Product not found', 404))
  }

  // Check if already in wishlist
  const alreadyWishlisted = await database.query(
    `SELECT id FROM wishlist_items WHERE user_id = $1 AND product_id = $2`,
    [userId, product_id],
  )

  if (alreadyWishlisted.rows.length > 0) {
    return next(new ErrorHandler('Product already in wishlist', 409))
  }

  // Add to wishlist
  const result = await database.query(
    `INSERT INTO wishlist_items (user_id, product_id, created_at, updated_at)
     VALUES ($1, $2, NOW(), NOW())
     RETURNING id, user_id, product_id, created_at`,
    [userId, product_id],
  )

  console.log(`✅ [WISHLIST] Product ${product_id} added for user ${userId}`)

  res.status(201).json({
    success: true,
    message: 'Product added to wishlist successfully',
    data: result.rows[0],
    timestamp: new Date(),
  })
})

/**
 * Remove product from wishlist
 * DELETE /api/v1/customer/wishlist/:product_id
 */
export const removeFromWishlist = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user.id
  const { product_id } = req.params

  const result = await database.query(
    `DELETE FROM wishlist_items
     WHERE user_id = $1 AND product_id = $2
     RETURNING id`,
    [userId, product_id],
  )

  if (result.rows.length === 0) {
    return next(new ErrorHandler('Item not in wishlist', 404))
  }

  console.log(`✅ [WISHLIST] Product ${product_id} removed for user ${userId}`)

  res.status(200).json({
    success: true,
    message: 'Product removed from wishlist successfully',
    timestamp: new Date(),
  })
})

/**
 * Get wishlist count
 * GET /api/v1/customer/wishlist/count
 */
export const getWishlistCount = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user.id

  const result = await database.query(
    `SELECT COUNT(*) as count FROM wishlist_items WHERE user_id = $1`,
    [userId],
  )

  const count = parseInt(result.rows[0].count)

  console.log(`✅ [WISHLIST] Count: ${count} items for user ${userId}`)

  res.status(200).json({
    success: true,
    message: 'Wishlist count retrieved successfully',
    data: { count },
    timestamp: new Date(),
  })
})
