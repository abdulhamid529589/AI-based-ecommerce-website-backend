import { catchAsyncErrors } from '../middlewares/catchAsyncError.js'
import ErrorHandler from '../middlewares/errorMiddleware.js'
import database from '../database/db.js'

/**
 * Get personalized feed for user
 * Shows: recommended products, trending items, personalized deals
 */
export const getPersonalizedFeed = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user?.id

  // Get user's purchase history and preferences
  let preferences = {
    favoriteCategories: [],
    priceRange: { min: 0, max: 100000 },
    preferredBrands: [],
  }

  if (userId) {
    const userStatsQuery = `
      SELECT
        p.category,
        MIN(p.price) as min_price,
        MAX(p.price) as max_price,
        COUNT(*) as purchase_count
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.buyer_id = $1
      GROUP BY p.category
      ORDER BY COUNT(*) DESC
      LIMIT 5
    `
    const statsResult = await database.query(userStatsQuery, [userId])

    if (statsResult.rows.length > 0) {
      preferences.favoriteCategories = statsResult.rows.map((r) => r.category)
      preferences.priceRange.min = statsResult.rows[0].min_price
      preferences.priceRange.max = statsResult.rows[0].max_price
    }
  }

  // Get recommended products
  const recommendedQuery = `
    SELECT
      p.id,
      p.name,
      p.price,
      p.category,
      p.ratings,
      p.images,
      'recommended' as feed_type,
      CASE
        WHEN p.category = ANY($1) THEN 3
        WHEN p.ratings > 4 THEN 2
        ELSE 1
      END as relevance_score
    FROM products p
    ${
      userId
        ? `WHERE p.id NOT IN (
      SELECT DISTINCT product_id FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.buyer_id = $2
    )`
        : ''
    }
    ORDER BY relevance_score DESC, p.ratings DESC
    LIMIT 8
  `

  const recommendedResult = await database.query(
    recommendedQuery,
    userId ? [preferences.favoriteCategories, userId] : [preferences.favoriteCategories],
  )

  // Get trending this week
  const trendingQuery = `
    SELECT
      p.id,
      p.name,
      p.price,
      p.category,
      p.ratings,
      p.images,
      'trending' as feed_type,
      COUNT(oi.id) as trend_count
    FROM products p
    LEFT JOIN order_items oi ON p.id = oi.product_id
    LEFT JOIN orders o ON oi.order_id = o.id
    WHERE o.created_at >= NOW() - INTERVAL '7 days' OR o.created_at IS NULL
    GROUP BY p.id, p.name, p.price, p.category, p.ratings, p.images
    ORDER BY trend_count DESC
    LIMIT 8
  `
  const trendingResult = await database.query(trendingQuery)

  // Get flash deals (high discount)
  const dealsQuery = `
    SELECT
      p.id,
      p.name,
      p.price,
      p.discount_percent,
      p.category,
      p.ratings,
      p.images,
      'flash_deal' as feed_type,
      p.discount_percent as savings
    FROM products p
    WHERE p.discount_percent > 20 AND p.stock > 0
    ORDER BY p.discount_percent DESC
    LIMIT 6
  `
  const dealsResult = await database.query(dealsQuery)

  // Combine and shuffle feed
  const feed = [...recommendedResult.rows, ...trendingResult.rows, ...dealsResult.rows]

  res.status(200).json({
    success: true,
    message: 'Personalized feed fetched',
    data: {
      feed: feed.slice(0, 20),
      sections: {
        recommended: recommendedResult.rows.length,
        trending: trendingResult.rows.length,
        flashDeals: dealsResult.rows.length,
      },
      userPreferences: preferences,
    },
  })
})

/**
 * Get smart product recommendations based on product viewing
 */
export const getProductRecommendations = catchAsyncErrors(async (req, res, next) => {
  const { productId } = req.params

  // Get the current product
  const productQuery = `SELECT * FROM products WHERE id = $1`
  const productResult = await database.query(productQuery, [productId])

  if (productResult.rows.length === 0) {
    return next(new ErrorHandler('Product not found', 404))
  }

  const product = productResult.rows[0]

  // Find similar products
  const similarQuery = `
    SELECT
      p.id,
      p.name,
      p.price,
      p.category,
      p.ratings,
      p.images,
      CASE
        WHEN p.category = $1 THEN 3
        WHEN ABS(p.price - $2) < ($2 * 0.3) THEN 2
        ELSE 1
      END as similarity_score
    FROM products p
    WHERE p.id != $3
    AND p.stock > 0
    ORDER BY similarity_score DESC, p.ratings DESC
    LIMIT 12
  `

  const similarResult = await database.query(similarQuery, [
    product.category,
    product.price,
    productId,
  ])

  // Get frequently bought together
  const togetherQuery = `
    SELECT DISTINCT
      p.id,
      p.name,
      p.price,
      p.category,
      p.ratings,
      p.images,
      COUNT(*) as times_bought_together
    FROM products p
    JOIN order_items oi ON p.id = oi.product_id
    JOIN orders o ON oi.order_id = o.id
    WHERE o.id IN (
      SELECT DISTINCT oi2.order_id
      FROM order_items oi2
      WHERE oi2.product_id = $1
    )
    AND p.id != $1
    GROUP BY p.id, p.name, p.price, p.category, p.ratings, p.images
    ORDER BY COUNT(*) DESC
    LIMIT 8
  `

  const togetherResult = await database.query(togetherQuery, [productId])

  res.status(200).json({
    success: true,
    message: 'Product recommendations fetched',
    data: {
      relatedProducts: similarResult.rows,
      frequentlyBoughtTogether: togetherResult.rows,
      viewedProduct: {
        id: product.id,
        name: product.name,
        category: product.category,
        price: product.price,
      },
    },
  })
})

/**
 * Get user activity insights
 */
export const getUserInsights = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user?.id

  if (!userId) {
    return next(new ErrorHandler('Unauthorized', 401))
  }

  // Get purchase stats
  const purchaseStatsQuery = `
    SELECT
      COUNT(DISTINCT o.id) as total_orders,
      SUM(o.total_price) as total_spent,
      AVG(o.total_price) as avg_order_value,
      COUNT(DISTINCT oi.product_id) as unique_products,
      MIN(o.created_at) as first_purchase,
      MAX(o.created_at) as last_purchase
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    WHERE o.buyer_id = $1
  `
  const purchaseResult = await database.query(purchaseStatsQuery, [userId])

  // Get favorite categories
  const categoriesQuery = `
    SELECT
      p.category,
      COUNT(*) as count,
      AVG(p.ratings) as avg_rating
    FROM order_items oi
    JOIN products p ON oi.product_id = p.id
    JOIN orders o ON oi.order_id = o.id
    WHERE o.buyer_id = $1
    GROUP BY p.category
    ORDER BY COUNT(*) DESC
    LIMIT 5
  `
  const categoriesResult = await database.query(categoriesQuery, [userId])

  // Get spending trend (last 30 days)
  const trendQuery = `
    SELECT
      DATE_TRUNC('day', o.created_at)::DATE as date,
      COUNT(*) as orders,
      SUM(o.total_price) as daily_spent
    FROM orders o
    WHERE o.buyer_id = $1
    AND o.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY DATE_TRUNC('day', o.created_at)
    ORDER BY date DESC
  `
  const trendResult = await database.query(trendQuery, [userId])

  const stats = purchaseResult.rows[0]

  res.status(200).json({
    success: true,
    message: 'User insights fetched',
    data: {
      purchaseStats: {
        totalOrders: parseInt(stats.total_orders) || 0,
        totalSpent: parseFloat(stats.total_spent) || 0,
        avgOrderValue: parseFloat(stats.avg_order_value) || 0,
        uniqueProducts: parseInt(stats.unique_products) || 0,
        firstPurchase: stats.first_purchase,
        lastPurchase: stats.last_purchase,
        memberSince: stats.first_purchase,
      },
      favoriteCategories: categoriesResult.rows.map((r) => ({
        name: r.category,
        purchases: parseInt(r.count),
        avgRating: parseFloat(r.avg_rating),
      })),
      spendingTrend: trendResult.rows.map((r) => ({
        date: r.date,
        orders: parseInt(r.orders),
        amount: parseFloat(r.daily_spent),
      })),
    },
  })
})

/**
 * Get wishlists with smart recommendations
 */
export const getWishlistInsights = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user?.id

  if (!userId) {
    return next(new ErrorHandler('Unauthorized', 401))
  }

  // Get wishlist items
  const wishlistQuery = `
    SELECT
      w.id,
      p.id as product_id,
      p.name,
      p.price,
      p.category,
      p.ratings,
      p.images,
      p.stock,
      p.discount_percent,
      w.created_at as added_to_wishlist,
      (p.price * (1 - p.discount_percent/100)) as discounted_price
    FROM wishlist w
    JOIN products p ON w.product_id = p.id
    WHERE w.buyer_id = $1
    ORDER BY w.created_at DESC
  `
  const wishlistResult = await database.query(wishlistQuery, [userId])

  // Get insights
  const totalWishlistValue = wishlistResult.rows.reduce((sum, item) => sum + item.price, 0)
  const totalDiscountSavings = wishlistResult.rows.reduce(
    (sum, item) => sum + (item.price - item.discounted_price),
    0,
  )

  res.status(200).json({
    success: true,
    message: 'Wishlist insights fetched',
    data: {
      wishlistItems: wishlistResult.rows,
      insights: {
        totalItems: wishlistResult.rows.length,
        totalValue: totalWishlistValue,
        potentialSavings: totalDiscountSavings,
        avgItemPrice: totalWishlistValue / (wishlistResult.rows.length || 1),
        itemsOnDiscount: wishlistResult.rows.filter((i) => i.discount_percent > 0).length,
        outOfStockItems: wishlistResult.rows.filter((i) => i.stock === 0).length,
      },
    },
  })
})
