/**
 * Review Controller
 * Manages product reviews and ratings
 */

import database from '../database/db.js'
import { catchAsyncErrors } from '../middlewares/catchAsyncError.js'

/**
 * Get reviews for a product
 * GET /api/v1/product/:product_id/reviews
 */
export const getProductReviews = catchAsyncErrors(async (req, res) => {
  const { product_id } = req.params
  const { page = 1, limit = 10 } = req.query
  const offset = (page - 1) * limit

  // Validate product exists
  const productCheck = await database.query('SELECT id FROM products WHERE id = $1', [product_id])
  if (productCheck.rows.length === 0) {
    return res.status(404).json({
      success: false,
      code: 'PRODUCT_NOT_FOUND',
      message: 'Product does not exist',
      timestamp: new Date(),
    })
  }

  // Get reviews with pagination
  const query = `
    SELECT
      r.id,
      r.product_id,
      r.user_id,
      r.rating,
      r.title,
      r.content,
      r.verified_purchase,
      r.helpful_count,
      u.name as reviewer_name,
      r.created_at,
      r.updated_at
    FROM reviews r
    JOIN users u ON r.user_id = u.id
    WHERE r.product_id = $1
    ORDER BY r.created_at DESC
    LIMIT $2 OFFSET $3
  `

  const countQuery = 'SELECT COUNT(*) as count FROM reviews WHERE product_id = $1'

  const [reviewsResult, countResult] = await Promise.all([
    database.query(query, [product_id, limit, offset]),
    database.query(countQuery, [product_id]),
  ])

  const total = parseInt(countResult.rows[0].count)

  console.log(
    `✅ [REVIEWS] Retrieved ${reviewsResult.rows.length}/${total} reviews for product ${product_id}`,
  )

  res.status(200).json({
    success: true,
    message: 'Product reviews retrieved successfully',
    data: reviewsResult.rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
    timestamp: new Date(),
  })
})

/**
 * Create a review for a product
 * POST /api/v1/product/:product_id/reviews
 * Body: { rating, title, content }
 */
export const createReview = catchAsyncErrors(async (req, res) => {
  const userId = req.user.id
  const { product_id } = req.params
  const { rating, title, content } = req.body

  // Validate input
  if (!rating || !title || !content) {
    return res.status(400).json({
      success: false,
      code: 'MISSING_FIELDS',
      message: 'Rating, title, and content are required',
      timestamp: new Date(),
    })
  }

  if (rating < 1 || rating > 5) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_RATING',
      message: 'Rating must be between 1 and 5',
      timestamp: new Date(),
    })
  }

  if (title.length < 3 || title.length > 100) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_TITLE',
      message: 'Title must be between 3 and 100 characters',
      timestamp: new Date(),
    })
  }

  if (content.length < 10 || content.length > 2000) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_CONTENT',
      message: 'Content must be between 10 and 2000 characters',
      timestamp: new Date(),
    })
  }

  // Validate product exists
  const productCheck = await database.query('SELECT id FROM products WHERE id = $1', [product_id])
  if (productCheck.rows.length === 0) {
    return res.status(404).json({
      success: false,
      code: 'PRODUCT_NOT_FOUND',
      message: 'Product does not exist',
      timestamp: new Date(),
    })
  }

  // Check if user already reviewed this product
  const existingReview = await database.query(
    'SELECT id FROM reviews WHERE user_id = $1 AND product_id = $2',
    [userId, product_id],
  )

  if (existingReview.rows.length > 0) {
    return res.status(409).json({
      success: false,
      code: 'REVIEW_EXISTS',
      message: 'You have already reviewed this product',
      timestamp: new Date(),
    })
  }

  // Check if user has purchased this product
  const purchaseCheck = await database.query(
    `SELECT id FROM order_items oi
     JOIN orders o ON oi.order_id = o.id
     WHERE oi.product_id = $1 AND o.buyer_id = $2`,
    [product_id, userId],
  )

  const verified_purchase = purchaseCheck.rows.length > 0

  // Create review
  const insertQuery = `
    INSERT INTO reviews (product_id, user_id, rating, title, content, verified_purchase, helpful_count, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, 0, NOW(), NOW())
    RETURNING id, product_id, user_id, rating, title, content, verified_purchase, helpful_count, created_at
  `

  const result = await database.query(insertQuery, [
    product_id,
    userId,
    rating,
    title,
    content,
    verified_purchase,
  ])

  // Update product rating average
  await updateProductRating(product_id)

  console.log(`✅ [REVIEWS] Review created by user ${userId} for product ${product_id}`)

  res.status(201).json({
    success: true,
    message: 'Review created successfully',
    data: result.rows[0],
    timestamp: new Date(),
  })
})

/**
 * Update a review
 * PUT /api/v1/reviews/:review_id
 * Body: { rating, title, content }
 */
export const updateReview = catchAsyncErrors(async (req, res) => {
  const userId = req.user.id
  const { review_id } = req.params
  const { rating, title, content } = req.body

  // Validate input
  if (!rating || !title || !content) {
    return res.status(400).json({
      success: false,
      code: 'MISSING_FIELDS',
      message: 'Rating, title, and content are required',
      timestamp: new Date(),
    })
  }

  // Check if review exists and belongs to user
  const reviewCheck = await database.query(
    'SELECT product_id FROM reviews WHERE id = $1 AND user_id = $2',
    [review_id, userId],
  )

  if (reviewCheck.rows.length === 0) {
    return res.status(403).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'You can only update your own reviews',
      timestamp: new Date(),
    })
  }

  const { product_id } = reviewCheck.rows[0]

  // Update review
  const updateQuery = `
    UPDATE reviews
    SET rating = $1, title = $2, content = $3, updated_at = NOW()
    WHERE id = $4
    RETURNING id, product_id, user_id, rating, title, content, verified_purchase, helpful_count, updated_at
  `

  const result = await database.query(updateQuery, [rating, title, content, review_id])

  // Update product rating average
  await updateProductRating(product_id)

  console.log(`✅ [REVIEWS] Review ${review_id} updated by user ${userId}`)

  res.status(200).json({
    success: true,
    message: 'Review updated successfully',
    data: result.rows[0],
    timestamp: new Date(),
  })
})

/**
 * Delete a review
 * DELETE /api/v1/reviews/:review_id
 */
export const deleteReview = catchAsyncErrors(async (req, res) => {
  const userId = req.user.id
  const { review_id } = req.params

  // Check if review exists and belongs to user
  const reviewCheck = await database.query(
    'SELECT product_id FROM reviews WHERE id = $1 AND user_id = $2',
    [review_id, userId],
  )

  if (reviewCheck.rows.length === 0) {
    return res.status(403).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'You can only delete your own reviews',
      timestamp: new Date(),
    })
  }

  const { product_id } = reviewCheck.rows[0]

  // Delete review
  await database.query('DELETE FROM reviews WHERE id = $1', [review_id])

  // Update product rating average
  await updateProductRating(product_id)

  console.log(`✅ [REVIEWS] Review ${review_id} deleted by user ${userId}`)

  res.status(200).json({
    success: true,
    message: 'Review deleted successfully',
    timestamp: new Date(),
  })
})

/**
 * Helper function to update product rating average
 */
async function updateProductRating(productId) {
  const query = `
    UPDATE products
    SET ratings = (
      SELECT AVG(rating) FROM reviews WHERE product_id = $1
    )
    WHERE id = $1
  `
  await database.query(query, [productId])
}
