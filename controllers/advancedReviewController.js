/**
 * Advanced Review Controller
 * Insane-level review system with moderation, voting, analytics, and more
 */

import database from '../database/db.js'
import { catchAsyncErrors } from '../middlewares/catchAsyncError.js'

/**
 * Get reviews for a product with advanced filtering/sorting
 * GET /api/v1/product/:product_id/reviews
 * Query params: page, limit, sort, filter, verified_only, search
 */
export const getAdvancedProductReviews = catchAsyncErrors(async (req, res) => {
  const { product_id } = req.params
  const {
    page = 1,
    limit = 10,
    sort = 'newest',
    filter = 'all',
    verified_only = false,
    search = '',
  } = req.query

  const userId = req.user?.id

  // Validate product exists
  const productCheck = await database.query('SELECT id FROM products WHERE id = $1', [product_id])
  if (productCheck.rows.length === 0) {
    return res.status(404).json({
      success: false,
      code: 'PRODUCT_NOT_FOUND',
      message: 'Product does not exist',
    })
  }

  const offset = (parseInt(page) - 1) * parseInt(limit)
  let sortClause = 'r.created_at DESC'
  let filterClause = "r.moderation_status = 'approved'"

  // Advanced sorting options
  switch (sort.toLowerCase()) {
    case 'newest':
      sortClause = 'r.created_at DESC'
      break
    case 'oldest':
      sortClause = 'r.created_at ASC'
      break
    case 'highest':
      sortClause = 'r.rating DESC'
      break
    case 'lowest':
      sortClause = 'r.rating ASC'
      break
    case 'helpful':
      sortClause = '(r.helpful_count - r.unhelpful_count) DESC'
      break
    case 'trending':
      sortClause = 'r.created_at DESC, (r.helpful_count - r.unhelpful_count) DESC'
      break
  }

  // Advanced filtering options
  if (filter !== 'all' && ['5', '4', '3', '2', '1'].includes(filter)) {
    filterClause += ` AND r.rating = ${parseInt(filter)}`
  }

  if (verified_only === 'true') {
    filterClause += ' AND r.verified_purchase = true'
  }

  // Search in review content
  if (search && search.trim()) {
    const searchTerm = search.trim().replace(/'/g, "''")
    filterClause += ` AND (r.title ILIKE '%${searchTerm}%' OR r.content ILIKE '%${searchTerm}%')`
  }

  // Build query to include user vote status
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
      r.unhelpful_count,
      r.images,
      r.is_featured,
      COALESCE(u.name, 'Anonymous') as reviewer_name,
      r.created_at,
      r.updated_at,
      (SELECT COUNT(*) FROM review_replies WHERE review_id = r.id) as reply_count,
      CASE
        WHEN $7::UUID IS NOT NULL THEN (
          SELECT vote_type FROM review_votes
          WHERE review_id = r.id AND user_id = $7
        )
        ELSE NULL
      END as user_vote
    FROM reviews r
    LEFT JOIN users u ON r.user_id = u.id
    WHERE r.product_id = $1 AND ${filterClause}
    ORDER BY ${sortClause}
    LIMIT $2 OFFSET $3
  `

  const countQuery = `
    SELECT COUNT(*) as count FROM reviews
    WHERE product_id = $1 AND ${filterClause}
  `

  const statsQuery = `
    SELECT
      COUNT(*) as total_reviews,
      AVG(r.rating) as avg_rating,
      COUNT(CASE WHEN r.rating = 5 THEN 1 END) as five_star,
      COUNT(CASE WHEN r.rating = 4 THEN 1 END) as four_star,
      COUNT(CASE WHEN r.rating = 3 THEN 1 END) as three_star,
      COUNT(CASE WHEN r.rating = 2 THEN 1 END) as two_star,
      COUNT(CASE WHEN r.rating = 1 THEN 1 END) as one_star,
      COUNT(CASE WHEN r.verified_purchase = true THEN 1 END) as verified_count
    FROM reviews r
    WHERE r.product_id = $1 AND r.moderation_status = 'approved'
  `

  const [reviewsResult, countResult, statsResult] = await Promise.all([
    database.query(query, [
      product_id,
      parseInt(limit),
      offset,
      sort,
      filter,
      verified_only,
      userId,
    ]),
    database.query(countQuery, [product_id]),
    database.query(statsQuery, [product_id]),
  ])

  const total = parseInt(countResult.rows[0].count)
  const stats = statsResult.rows[0]

  console.log(
    `📖 [REVIEWS] Retrieved ${reviewsResult.rows.length}/${total} reviews for product ${product_id}`,
  )

  res.status(200).json({
    success: true,
    message: 'Reviews retrieved successfully',
    data: reviewsResult.rows.map((review) => ({
      ...review,
      helpful_score: review.helpful_count - review.unhelpful_count,
    })),
    stats: {
      total: parseInt(stats.total_reviews || 0),
      avgRating: parseFloat(stats.avg_rating || 0).toFixed(1),
      distribution: {
        5: parseInt(stats.five_star || 0),
        4: parseInt(stats.four_star || 0),
        3: parseInt(stats.three_star || 0),
        2: parseInt(stats.two_star || 0),
        1: parseInt(stats.one_star || 0),
      },
      verifiedCount: parseInt(stats.verified_count || 0),
    },
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit)),
    },
  })
})

/**
 * Create a review for a product
 * POST /api/v1/product/:product_id/reviews
 * Body: { rating, title, content, images[] }
 */
export const createAdvancedReview = catchAsyncErrors(async (req, res) => {
  const userId = req.user?.id

  if (!userId) {
    return res.status(401).json({
      success: false,
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Please log in to post a review',
    })
  }

  const { product_id } = req.params
  const { rating, title, content, images = [] } = req.body

  // Comprehensive validation
  if (!rating || !title || !content) {
    return res.status(400).json({
      success: false,
      code: 'MISSING_FIELDS',
      message: 'Rating, title, and content are required',
    })
  }

  const ratingNum = parseInt(rating, 10)
  if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_RATING',
      message: 'Rating must be between 1 and 5',
    })
  }

  if (title.trim().length < 3 || title.trim().length > 100) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_TITLE',
      message: 'Title must be between 3 and 100 characters',
    })
  }

  if (content.trim().length < 10 || content.trim().length > 2000) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_CONTENT',
      message: 'Review must be between 10 and 2000 characters',
    })
  }

  // Check if product exists
  const productCheck = await database.query('SELECT id FROM products WHERE id = $1', [product_id])
  if (productCheck.rows.length === 0) {
    return res.status(404).json({
      success: false,
      code: 'PRODUCT_NOT_FOUND',
      message: 'Product not found',
    })
  }

  // Check if user already reviewed
  const existingReview = await database.query(
    'SELECT id FROM reviews WHERE user_id = $1 AND product_id = $2',
    [userId, product_id],
  )

  if (existingReview.rows.length > 0) {
    return res.status(409).json({
      success: false,
      code: 'REVIEW_EXISTS',
      message: 'You have already reviewed this product',
    })
  }

  // Verify purchase
  const purchaseCheck = await database.query(
    `SELECT oi.id FROM order_items oi
     JOIN orders o ON oi.order_id = o.id
     WHERE oi.product_id = $1 AND o.buyer_id = $2`,
    [product_id, userId],
  )

  const verifiedPurchase = purchaseCheck.rows.length > 0

  // Simple sentiment analysis (in production, use ML API)
  const sentimentScore = calculateSentiment(content)
  const sentimentLabel =
    sentimentScore > 0.3 ? 'positive' : sentimentScore < -0.3 ? 'negative' : 'neutral'

  // Create review
  const insertQuery = `
    INSERT INTO reviews (
      product_id, user_id, rating, title, content, comment,
      verified_purchase, images, sentiment_score, sentiment_label,
      moderation_status, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'approved', NOW(), NOW())
    RETURNING *
  `

  const result = await database.query(insertQuery, [
    product_id,
    userId,
    ratingNum,
    title.trim(),
    content.trim(),
    content.trim(),
    verifiedPurchase,
    images,
    sentimentScore,
    sentimentLabel,
  ])

  console.log(`✅ [REVIEW CREATED] Review ${result.rows[0].id} by user ${userId}`)

  res.status(201).json({
    success: true,
    message: 'Review posted successfully',
    data: result.rows[0],
  })
})

/**
 * Mark review as helpful/unhelpful
 * POST /api/v1/reviews/:review_id/vote
 * Body: { vote_type: 'helpful' | 'unhelpful' }
 */
export const voteOnReview = catchAsyncErrors(async (req, res) => {
  const userId = req.user?.id
  if (!userId) {
    return res.status(401).json({
      success: false,
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Please log in to vote',
    })
  }

  const { review_id } = req.params
  const { vote_type } = req.body

  if (!['helpful', 'unhelpful'].includes(vote_type)) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_VOTE',
      message: 'Vote type must be helpful or unhelpful',
    })
  }

  // Check if review exists
  const reviewCheck = await database.query('SELECT id FROM reviews WHERE id = $1', [review_id])
  if (reviewCheck.rows.length === 0) {
    return res.status(404).json({
      success: false,
      code: 'REVIEW_NOT_FOUND',
      message: 'Review not found',
    })
  }

  // Upsert vote
  const voteQuery = `
    INSERT INTO review_votes (review_id, user_id, vote_type)
    VALUES ($1, $2, $3)
    ON CONFLICT (review_id, user_id) DO UPDATE SET vote_type = $3
    RETURNING *
  `

  await database.query(voteQuery, [review_id, userId, vote_type])

  // Update helpful counts
  const countQuery = `
    UPDATE reviews
    SET
      helpful_count = (SELECT COUNT(*) FROM review_votes WHERE review_id = $1 AND vote_type = 'helpful'),
      unhelpful_count = (SELECT COUNT(*) FROM review_votes WHERE review_id = $1 AND vote_type = 'unhelpful')
    WHERE id = $1
    RETURNING helpful_count, unhelpful_count
  `

  const result = await database.query(countQuery, [review_id])

  res.status(200).json({
    success: true,
    message: 'Vote recorded',
    data: result.rows[0],
  })
})

/**
 * Flag review as inappropriate
 * POST /api/v1/reviews/:review_id/flag
 * Body: { reason, description }
 */
export const flagReview = catchAsyncErrors(async (req, res) => {
  const userId = req.user?.id
  if (!userId) {
    return res.status(401).json({
      success: false,
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Please log in',
    })
  }

  const { review_id } = req.params
  const { reason, description } = req.body

  const validReasons = ['spam', 'offensive', 'irrelevant', 'fake', 'other']
  if (!validReasons.includes(reason)) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_REASON',
      message: 'Invalid flag reason',
    })
  }

  const flagQuery = `
    INSERT INTO review_flags (review_id, user_id, reason, description)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `

  const result = await database.query(flagQuery, [review_id, userId, reason, description])

  // Increment flagged count
  await database.query('UPDATE reviews SET flagged_count = flagged_count + 1 WHERE id = $1', [
    review_id,
  ])

  res.status(201).json({
    success: true,
    message: 'Review flagged for moderation',
    data: result.rows[0],
  })
})

/**
 * Reply to a review
 * POST /api/v1/reviews/:review_id/replies
 * Body: { content }
 */
export const replyToReview = catchAsyncErrors(async (req, res) => {
  const userId = req.user?.id
  if (!userId) {
    return res.status(401).json({
      success: false,
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Please log in',
    })
  }

  const { review_id } = req.params
  const { content } = req.body

  if (!content || content.trim().length < 5) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_CONTENT',
      message: 'Reply must be at least 5 characters',
    })
  }

  const replyQuery = `
    INSERT INTO review_replies (review_id, user_id, content)
    VALUES ($1, $2, $3)
    RETURNING *
  `

  const result = await database.query(replyQuery, [review_id, userId, content.trim()])

  res.status(201).json({
    success: true,
    message: 'Reply posted',
    data: result.rows[0],
  })
})

/**
 * Get review statistics for product
 * GET /api/v1/product/:product_id/review-stats
 */
export const getReviewStatistics = catchAsyncErrors(async (req, res) => {
  const { product_id } = req.params

  const statsQuery = `
    SELECT * FROM review_statistics WHERE product_id = $1
  `

  const result = await database.query(statsQuery, [product_id])

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      code: 'STATS_NOT_FOUND',
      message: 'No statistics available yet',
    })
  }

  res.status(200).json({
    success: true,
    data: result.rows[0],
  })
})

// Helper function: Simple sentiment analysis
function calculateSentiment(text) {
  const positiveWords = [
    'excellent',
    'amazing',
    'great',
    'awesome',
    'perfect',
    'love',
    'wonderful',
    'fantastic',
    'best',
  ]
  const negativeWords = [
    'terrible',
    'awful',
    'horrible',
    'bad',
    'worse',
    'hate',
    'waste',
    'poor',
    'worst',
  ]

  const lowerText = text.toLowerCase()
  let score = 0

  positiveWords.forEach((word) => {
    if (lowerText.includes(word)) score += 1
  })
  negativeWords.forEach((word) => {
    if (lowerText.includes(word)) score -= 1
  })

  return score / text.split(' ').length
}

export default {
  getAdvancedProductReviews,
  createAdvancedReview,
  voteOnReview,
  flagReview,
  replyToReview,
  getReviewStatistics,
}
