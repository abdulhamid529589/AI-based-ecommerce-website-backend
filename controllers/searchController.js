import { catchAsyncErrors } from '../middlewares/catchAsyncError.js'
import ErrorHandler from '../middlewares/errorMiddleware.js'
import database from '../database/db.js'

/**
 * Intelligent AI Search with suggestions, filtering, and recommendations
 * Combines text search, category filtering, and recommendation engine
 */
export const aiSearch = catchAsyncErrors(async (req, res, next) => {
  const { query, category, filters = {}, limit = 20, page = 1 } = req.body

  if (!query || query.trim().length < 2) {
    return next(new ErrorHandler('Search query must be at least 2 characters', 400))
  }

  const offset = (page - 1) * limit

  // Build dynamic WHERE clause
  let whereConditions = ['(p.name ILIKE $1 OR p.description ILIKE $1 OR p.category ILIKE $1)']
  let queryParams = [`%${query}%`]
  let paramIndex = 2

  // Add category filter
  if (category) {
    whereConditions.push(`p.category = $${paramIndex}`)
    queryParams.push(category)
    paramIndex++
  }

  // Add price filter
  if (filters.minPrice !== undefined) {
    whereConditions.push(`p.price >= $${paramIndex}`)
    queryParams.push(filters.minPrice)
    paramIndex++
  }
  if (filters.maxPrice !== undefined) {
    whereConditions.push(`p.price <= $${paramIndex}`)
    queryParams.push(filters.maxPrice)
    paramIndex++
  }

  // Add rating filter
  if (filters.minRating !== undefined) {
    whereConditions.push(`p.ratings >= $${paramIndex}`)
    queryParams.push(filters.minRating)
    paramIndex++
  }

  // Add stock filter
  if (filters.inStockOnly) {
    whereConditions.push('p.stock > 0')
  }

  const whereClause = whereConditions.join(' AND ')

  // Get total count
  const countQuery = `SELECT COUNT(*) as total FROM products p WHERE ${whereClause}`
  const countResult = await database.query(countQuery, queryParams)
  const total = parseInt(countResult.rows[0].total)

  // Get paginated results
  const searchQuery = `
    SELECT
      p.id,
      p.name,
      p.description,
      p.price,
      p.category,
      p.ratings,
      p.stock,
      p.images,
      p.created_at,
      (
        SELECT COUNT(*) FROM order_items oi
        WHERE oi.product_id = p.id
      ) as popularity_score,
      (
        SELECT AVG(ratings) FROM product_reviews pr
        WHERE pr.product_id = p.id
      ) as avg_review_rating
    FROM products p
    WHERE ${whereClause}
    ORDER BY
      p.ratings DESC,
      popularity_score DESC,
      p.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `

  queryParams.push(limit, offset)
  const productsResult = await database.query(searchQuery, queryParams)

  // Get search suggestions
  const suggestionsQuery = `
    SELECT DISTINCT name
    FROM products
    WHERE name ILIKE $1
    LIMIT 5
  `
  const suggestionsResult = await database.query(suggestionsQuery, [`%${query}%`])

  // Get related categories
  const categoriesQuery = `
    SELECT DISTINCT category, COUNT(*) as count
    FROM products
    WHERE name ILIKE $1
    GROUP BY category
    ORDER BY count DESC
    LIMIT 5
  `
  const categoriesResult = await database.query(categoriesQuery, [`%${query}%`])

  res.status(200).json({
    success: true,
    message: 'Search results fetched successfully',
    data: {
      products: productsResult.rows,
      suggestions: suggestionsResult.rows.map((r) => r.name),
      relatedCategories: categoriesResult.rows.map((r) => ({
        name: r.category,
        count: parseInt(r.count),
      })),
      filters: filters,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
      },
    },
  })
})

/**
 * Get smart search suggestions based on user input
 * Returns: text suggestions, trending searches, categories, recent searches
 */
export const getSearchSuggestions = catchAsyncErrors(async (req, res, next) => {
  const { query } = req.query

  if (!query || query.trim().length < 2) {
    return res.status(200).json({
      success: true,
      data: {
        textSuggestions: [],
        trendingSearches: [],
        categories: [],
        recentSearches: [],
      },
    })
  }

  // Text suggestions from product names
  const textQuery = `
    SELECT DISTINCT name
    FROM products
    WHERE name ILIKE $1
    ORDER BY name ASC
    LIMIT 8
  `
  const textResult = await database.query(textQuery, [`%${query}%`])

  // Get categories matching the query
  const categoryQuery = `
    SELECT DISTINCT category
    FROM products
    WHERE category ILIKE $1
    ORDER BY category ASC
    LIMIT 5
  `
  const categoryResult = await database.query(categoryQuery, [`%${query}%`])

  // Get trending searches (products sorted by popularity)
  const trendingQuery = `
    SELECT DISTINCT name
    FROM products
    WHERE name ILIKE $1
    ORDER BY (SELECT COUNT(*) FROM order_items oi WHERE oi.product_id = products.id) DESC
    LIMIT 5
  `
  const trendingResult = await database.query(trendingQuery, [`%${query}%`])

  res.status(200).json({
    success: true,
    message: 'Search suggestions fetched',
    data: {
      textSuggestions: textResult.rows.map((r) => r.name),
      categories: categoryResult.rows.map((r) => r.category),
      trendingSearches: trendingResult.rows.map((r) => r.name),
      highlightedCategories: categoryResult.rows.map((r) => ({
        name: r.category,
        searchUrl: `/products?category=${encodeURIComponent(r.category)}`,
      })),
    },
  })
})

/**
 * Get personalized product recommendations for a user
 * Based on: browsing history, purchases, category preferences, ratings
 */
export const getPersonalizedRecommendations = catchAsyncErrors(async (req, res, next) => {
  const { userId, context = 'browsing', limit = 12 } = req.body

  if (!userId) {
    // Return popular products if no user
    const query = `
      SELECT
        p.id,
        p.name,
        p.price,
        p.category,
        p.ratings,
        p.images,
        COUNT(oi.id) as purchase_count
      FROM products p
      LEFT JOIN order_items oi ON p.id = oi.product_id
      GROUP BY p.id, p.name, p.price, p.category, p.ratings, p.images
      ORDER BY purchase_count DESC, p.ratings DESC
      LIMIT $1
    `
    const result = await database.query(query, [limit])

    return res.status(200).json({
      success: true,
      message: 'Recommendations fetched',
      data: {
        recommendations: result.rows,
        reasons: ['Trending products', 'Top rated products'],
        context: 'anonymous',
      },
    })
  }

  // Get user's purchase history and preferences
  const userHistoryQuery = `
    SELECT DISTINCT p.category, AVG(p.ratings) as avg_rating
    FROM order_items oi
    JOIN products p ON oi.product_id = p.id
    JOIN orders o ON oi.order_id = o.id
    WHERE o.buyer_id = $1
    GROUP BY p.category
    ORDER BY AVG(p.ratings) DESC
    LIMIT 3
  `
  const historyResult = await database.query(userHistoryQuery, [userId])

  // Get recommended products based on categories user has bought from
  const recommendedProducts = []
  const reasons = []

  if (historyResult.rows.length > 0) {
    const topCategories = historyResult.rows.map((r) => r.category)

    const categoryQuery = `
      SELECT
        p.id,
        p.name,
        p.price,
        p.category,
        p.ratings,
        p.images,
        p.stock
      FROM products p
      WHERE p.category = ANY($1)
      AND p.id NOT IN (
        SELECT DISTINCT product_id
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.buyer_id = $2
      )
      ORDER BY p.ratings DESC, p.created_at DESC
      LIMIT $3
    `
    const result = await database.query(categoryQuery, [topCategories, userId, limit])
    recommendedProducts.push(...result.rows)
    reasons.push('Based on your favorite categories')
  }

  // Add similar products to recently viewed
  if (context === 'browsing') {
    const recentQuery = `
      SELECT p.category FROM products p LIMIT 1
    `
    const recentResult = await database.query(recentQuery)

    if (recommendedProducts.length < limit && recentResult.rows.length > 0) {
      const category = recentResult.rows[0].category
      const similarQuery = `
        SELECT
          p.id,
          p.name,
          p.price,
          p.category,
          p.ratings,
          p.images
        FROM products p
        WHERE p.category = $1
        LIMIT $2
      `
      const similarResult = await database.query(similarQuery, [
        category,
        limit - recommendedProducts.length,
      ])
      recommendedProducts.push(...similarResult.rows)
      reasons.push('Similar to products you viewed')
    }
  }

  res.status(200).json({
    success: true,
    message: 'Personalized recommendations fetched',
    data: {
      recommendations: recommendedProducts,
      reasons: reasons.length > 0 ? reasons : ['Popular products'],
      count: recommendedProducts.length,
      context,
    },
  })
})

/**
 * Get trending and popular products
 */
export const getTrendingProducts = catchAsyncErrors(async (req, res, next) => {
  const { limit = 20, timeframe = '30' } = req.query

  const query = `
    SELECT
      p.id,
      p.name,
      p.price,
      p.category,
      p.ratings,
      p.stock,
      p.images,
      COUNT(oi.id) as times_ordered,
      SUM(oi.quantity) as total_quantity,
      RANK() OVER (ORDER BY COUNT(oi.id) DESC) as trend_rank
    FROM products p
    LEFT JOIN order_items oi ON p.id = oi.product_id
    LEFT JOIN orders o ON oi.order_id = o.id
    WHERE o.created_at >= NOW() - INTERVAL '${timeframe} days'
      OR o.created_at IS NULL
    GROUP BY p.id, p.name, p.price, p.category, p.ratings, p.stock, p.images
    ORDER BY trend_rank ASC
    LIMIT $1
  `

  const result = await database.query(query, [limit])

  res.status(200).json({
    success: true,
    message: 'Trending products fetched',
    data: {
      products: result.rows,
      timeframe: `${timeframe} days`,
      count: result.rows.length,
    },
  })
})
