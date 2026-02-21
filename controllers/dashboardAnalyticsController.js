import db from '../database/db.js'
import { catchAsyncErrors } from '../middlewares/catchAsyncError.js'
import apiResponse from '../utils/apiResponse.js'

/**
 * ===== REVENUE ANALYTICS =====
 */

// Get revenue metrics with growth rate, targets, forecasts
export const getRevenueMetrics = catchAsyncErrors(async (req, res, next) => {
  const { startDate, endDate, period = 'daily' } = req.query

  const query = `
    SELECT
      SUM(total_price) as total_revenue,
      COUNT(id) as total_orders,
      AVG(total_price) as avg_order_value,
      MAX(total_price) as highest_order,
      MIN(total_price) as lowest_order,
      COUNT(DISTINCT buyer_id) as unique_customers
    FROM orders
    WHERE order_status != 'Cancelled'
    ${startDate ? `AND created_at >= $1` : ''}
    ${endDate ? `AND created_at <= $${startDate ? '2' : '1'}` : ''}
  `

  const params = []
  if (startDate) params.push(new Date(startDate))
  if (endDate) params.push(new Date(endDate))

  const result = await db.query(query, params.length > 0 ? params : undefined)
  const metrics = result.rows[0]

  // Calculate growth rate (compare with previous period)
  const daysDiff =
    startDate && endDate
      ? Math.floor((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24))
      : 30
  const previousQuery = `
    SELECT SUM(total_price) as prev_revenue
    FROM orders
    WHERE order_status != 'Cancelled'
    AND created_at >= $1
    AND created_at <= $2
  `

  const prevStart = new Date(startDate || new Date().setDate(new Date().getDate() - daysDiff * 2))
  const prevEnd = new Date(startDate || new Date())

  const prevResult = await db.query(previousQuery, [prevStart, prevEnd])
  const prevRevenue = prevResult.rows[0].prev_revenue || 0
  const growthRate = prevRevenue ? ((metrics.total_revenue - prevRevenue) / prevRevenue) * 100 : 0

  return res.status(200).json({
    success: true,
    message: 'Revenue metrics fetched successfully',
    data: {
      totalRevenue: parseFloat(metrics.total_revenue) || 0,
      totalOrders: parseInt(metrics.total_orders) || 0,
      avgOrderValue: parseFloat(metrics.avg_order_value) || 0,
      highestOrder: parseFloat(metrics.highest_order) || 0,
      lowestOrder: parseFloat(metrics.lowest_order) || 0,
      uniqueCustomers: parseInt(metrics.unique_customers) || 0,
      growthRate: parseFloat(growthRate.toFixed(2)),
    },
    timestamp: new Date().toISOString(),
  })
})

// Get revenue chart data (time-series)
export const getRevenueChart = catchAsyncErrors(async (req, res, next) => {
  const { startDate, endDate, period = 'daily' } = req.query

  let dateFormat = 'YYYY-MM-DD'
  if (period === 'weekly') dateFormat = 'YYYY-WW'
  if (period === 'monthly') dateFormat = 'YYYY-MM'
  if (period === 'hourly') dateFormat = 'YYYY-MM-DD HH:00'

  const query = `
    SELECT
      TO_CHAR(created_at, $1) as period,
      SUM(total_amount) as revenue,
      COUNT(id) as orders,
      AVG(total_amount) as avg_order_value
    FROM orders
    WHERE status != 'cancelled'
    ${startDate ? `AND created_at >= $${dateFormat === 'YYYY-MM-DD' ? '2' : '2'}` : ''}
    ${endDate ? `AND created_at <= $${dateFormat === 'YYYY-MM-DD' ? '3' : '3'}` : ''}
    GROUP BY TO_CHAR(created_at, $1)
    ORDER BY period ASC
  `

  const params = [dateFormat]
  if (startDate) params.push(new Date(startDate))
  if (endDate) params.push(new Date(endDate))

  const result = await db.query(query, params)

  return res
    .status(200)
    .json(new apiResponse(200, result.rows, 'Revenue chart data fetched successfully'))
})

// Get revenue comparison between periods
export const getRevenueComparison = catchAsyncErrors(async (req, res, next) => {
  const { period1Start, period1End, period2Start, period2End } = req.query

  const query1 = `
    SELECT
      SUM(total_amount) as revenue,
      COUNT(id) as orders,
      AVG(total_amount) as avg_order_value
    FROM orders
    WHERE status != 'cancelled'
    AND created_at >= $1
    AND created_at <= $2
  `

  const query2 = `
    SELECT
      SUM(total_amount) as revenue,
      COUNT(id) as orders,
      AVG(total_amount) as avg_order_value
    FROM orders
    WHERE status != 'cancelled'
    AND created_at >= $1
    AND created_at <= $2
  `

  const result1 = await db.query(query1, [new Date(period1Start), new Date(period1End)])
  const result2 = await db.query(query2, [new Date(period2Start), new Date(period2End)])

  const period1Data = result1.rows[0]
  const period2Data = result2.rows[0]

  const comparison = {
    period1: {
      revenue: parseFloat(period1Data.revenue) || 0,
      orders: parseInt(period1Data.orders) || 0,
      avgOrderValue: parseFloat(period1Data.avg_order_value) || 0,
    },
    period2: {
      revenue: parseFloat(period2Data.revenue) || 0,
      orders: parseInt(period2Data.orders) || 0,
      avgOrderValue: parseFloat(period2Data.avg_order_value) || 0,
    },
    percentChange: {
      revenue: period1Data.revenue
        ? ((period2Data.revenue - period1Data.revenue) / period1Data.revenue) * 100
        : 0,
      orders: period1Data.orders
        ? ((period2Data.orders - period1Data.orders) / period1Data.orders) * 100
        : 0,
      avgOrderValue: period1Data.avg_order_value
        ? ((period2Data.avg_order_value - period1Data.avg_order_value) /
            period1Data.avg_order_value) *
          100
        : 0,
    },
  }

  return res
    .status(200)
    .json(new apiResponse(200, comparison, 'Revenue comparison fetched successfully'))
})

/**
 * ===== PRODUCT ANALYTICS =====
 */

// Get top products by revenue or units sold
export const getTopProducts = catchAsyncErrors(async (req, res, next) => {
  const { metric = 'revenue', limit = 10, startDate, endDate } = req.query

  const orderByMetric = metric === 'units' ? 'SUM(oi.quantity)' : 'SUM(oi.price * oi.quantity)'

  const query = `
    SELECT
      p.id,
      p.name,
      p.price,
      COUNT(DISTINCT o.id) as order_count,
      SUM(oi.quantity) as units_sold,
      SUM(oi.price * oi.quantity) as revenue,
      AVG(r.rating) as avg_rating,
      COUNT(r.id) as review_count
    FROM products p
    LEFT JOIN order_items oi ON p.id = oi.product_id
    LEFT JOIN orders o ON oi.order_id = o.id
    LEFT JOIN reviews r ON p.id = r.product_id
    WHERE o.status != 'cancelled' OR o.id IS NULL
    ${startDate ? `AND o.created_at >= $1` : ''}
    ${endDate ? `AND o.created_at <= $${startDate ? '2' : '1'}` : ''}
    GROUP BY p.id, p.name, p.price
    ORDER BY ${orderByMetric} DESC
    LIMIT $${startDate && endDate ? '3' : startDate || endDate ? '2' : '1'}
  `

  const params = []
  if (startDate) params.push(new Date(startDate))
  if (endDate) params.push(new Date(endDate))
  params.push(parseInt(limit))

  const result = await db.query(query, params)

  return res
    .status(200)
    .json(new apiResponse(200, result.rows, 'Top products fetched successfully'))
})

// Get product performance metrics
export const getProductPerformance = catchAsyncErrors(async (req, res, next) => {
  const { productId, startDate, endDate } = req.query

  const query = `
    SELECT
      p.id,
      p.name,
      p.price,
      p.stock,
      COUNT(DISTINCT oi.order_id) as times_ordered,
      SUM(oi.quantity) as total_quantity_sold,
      SUM(oi.price * oi.quantity) as total_revenue,
      AVG(oi.price * oi.quantity) as avg_order_value,
      COUNT(DISTINCT r.id) as total_reviews,
      AVG(r.rating) as avg_rating,
      COUNT(CASE WHEN r.rating >= 4 THEN 1 END) as positive_reviews,
      COUNT(CASE WHEN r.rating < 4 THEN 1 END) as negative_reviews,
      COUNT(DISTINCT w.id) as wishlist_count
    FROM products p
    LEFT JOIN order_items oi ON p.id = oi.product_id
    LEFT JOIN orders o ON oi.order_id = o.id
    LEFT JOIN reviews r ON p.id = r.product_id
    LEFT JOIN wishlist w ON p.id = w.product_id
    WHERE p.id = $1
    ${startDate ? `AND o.created_at >= $2` : ''}
    ${endDate ? `AND o.created_at <= $${startDate ? '3' : '2'}` : ''}
    GROUP BY p.id, p.name, p.price, p.stock
  `

  const params = [productId]
  if (startDate) params.push(new Date(startDate))
  if (endDate) params.push(new Date(endDate))

  const result = await db.query(query, params)

  if (result.rows.length === 0) {
    return res.status(404).json(new apiResponse(404, null, 'Product not found'))
  }

  return res
    .status(200)
    .json(new apiResponse(200, result.rows[0], 'Product performance fetched successfully'))
})

// Get category performance
export const getCategoryPerformance = catchAsyncErrors(async (req, res, next) => {
  const { startDate, endDate } = req.query

  const query = `
    SELECT
      p.category,
      COUNT(DISTINCT p.id) as total_products,
      COUNT(DISTINCT oi.order_id) as total_orders,
      SUM(oi.quantity) as units_sold,
      SUM(oi.price * oi.quantity) as revenue,
      AVG(r.rating) as avg_rating
    FROM products p
    LEFT JOIN order_items oi ON p.id = oi.product_id
    LEFT JOIN orders o ON oi.order_id = o.id
    LEFT JOIN reviews r ON p.id = r.product_id
    WHERE o.order_status != 'Cancelled' OR o.id IS NULL
    ${startDate ? `AND o.created_at >= $1` : ''}
    ${endDate ? `AND o.created_at <= $${startDate ? '2' : '1'}` : ''}
    GROUP BY p.category
    ORDER BY revenue DESC
  `

  const params = []
  if (startDate) params.push(new Date(startDate))
  if (endDate) params.push(new Date(endDate))

  const result = await db.query(query, params)

  return res.status(200).json({
    success: true,
    message: 'Category performance fetched successfully',
    data: result.rows,
    timestamp: new Date().toISOString(),
  })
})

/**
 * ===== CUSTOMER ANALYTICS =====
 */

// Get customer segments (VIP, Active, At-risk)
export const getCustomerSegments = catchAsyncErrors(async (req, res, next) => {
  const query = `
    SELECT
      CASE
        WHEN total_spent >= 10000 THEN 'VIP'
        WHEN total_orders >= 5 AND days_since_last_order <= 30 THEN 'Active'
        WHEN days_since_last_order > 90 THEN 'At-Risk'
        ELSE 'Regular'
      END as segment,
      COUNT(*) as customer_count,
      AVG(total_spent) as avg_spent,
      AVG(total_orders) as avg_orders
    FROM (
      SELECT
        u.id,
        COALESCE(SUM(o.total_amount), 0) as total_spent,
        COUNT(o.id) as total_orders,
        EXTRACT(DAY FROM NOW() - MAX(o.created_at)) as days_since_last_order
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id AND o.status != 'cancelled'
      GROUP BY u.id
    ) customer_stats
    GROUP BY segment
  `

  const result = await db.query(query)

  return res
    .status(200)
    .json(new apiResponse(200, result.rows, 'Customer segments fetched successfully'))
})

// Get customer lifetime value (LTV) analysis
export const getCustomerLifetimeValue = catchAsyncErrors(async (req, res, next) => {
  const { limit = 20 } = req.query

  const query = `
    SELECT
      u.id,
      u.name,
      u.email,
      COUNT(DISTINCT o.id) as total_orders,
      COALESCE(SUM(o.total_amount), 0) as lifetime_value,
      AVG(o.total_amount) as avg_order_value,
      MAX(o.created_at) as last_order_date,
      EXTRACT(DAY FROM MAX(o.created_at)) as days_since_last_order,
      COUNT(DISTINCT r.id) as reviews_posted
    FROM users u
    LEFT JOIN orders o ON u.id = o.user_id AND o.status != 'cancelled'
    LEFT JOIN reviews r ON u.id = r.user_id
    GROUP BY u.id, u.name, u.email
    ORDER BY lifetime_value DESC
    LIMIT $1
  `

  const result = await db.query(query, [parseInt(limit)])

  return res
    .status(200)
    .json(new apiResponse(200, result.rows, 'Customer LTV fetched successfully'))
})

// Get cohort analysis (users by join date)
export const getCohortAnalysis = catchAsyncErrors(async (req, res, next) => {
  const query = `
    SELECT
      DATE_TRUNC('month', u.created_at) as cohort_month,
      COUNT(DISTINCT u.id) as users_in_cohort,
      COUNT(DISTINCT o.id) as total_orders,
      COALESCE(SUM(o.total_amount), 0) as total_revenue,
      AVG(o.total_amount) as avg_order_value,
      COUNT(DISTINCT CASE WHEN o.id IS NOT NULL THEN u.id END)::FLOAT /
        COUNT(DISTINCT u.id) as retention_rate
    FROM users u
    LEFT JOIN orders o ON u.id = o.user_id AND o.status != 'cancelled'
    GROUP BY DATE_TRUNC('month', u.created_at)
    ORDER BY cohort_month DESC
  `

  const result = await db.query(query)

  return res
    .status(200)
    .json(new apiResponse(200, result.rows, 'Cohort analysis fetched successfully'))
})

/**
 * ===== ORDER ANALYTICS =====
 */

// Get order metrics
export const getOrderMetrics = catchAsyncErrors(async (req, res, next) => {
  const { startDate, endDate } = req.query

  const query = `
    SELECT
      COUNT(*) as total_orders,
      COUNT(DISTINCT user_id) as unique_customers,
      AVG(total_amount) as avg_order_value,
      SUM(total_amount) as total_revenue,
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
      COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_orders,
      COUNT(CASE WHEN status = 'shipped' THEN 1 END) as shipped_orders,
      COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders,
      COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders
    FROM orders
    ${startDate ? `WHERE created_at >= $1` : ''}
    ${endDate ? `${startDate ? 'AND' : 'WHERE'} created_at <= $${startDate ? '2' : '1'}` : ''}
  `

  const params = []
  if (startDate) params.push(new Date(startDate))
  if (endDate) params.push(new Date(endDate))

  const result = await db.query(query, params)

  return res
    .status(200)
    .json(new apiResponse(200, result.rows[0], 'Order metrics fetched successfully'))
})

// Get order status distribution
export const getOrderStatusDistribution = catchAsyncErrors(async (req, res, next) => {
  const query = `
    SELECT
      status,
      COUNT(*) as count,
      SUM(total_amount) as revenue,
      ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
    FROM orders
    GROUP BY status
    ORDER BY count DESC
  `

  const result = await db.query(query)

  return res
    .status(200)
    .json(new apiResponse(200, result.rows, 'Order status distribution fetched successfully'))
})

// Get peak order times
export const getOrderPeakTimes = catchAsyncErrors(async (req, res, next) => {
  const query = `
    SELECT
      EXTRACT(HOUR FROM created_at) as hour,
      EXTRACT(DOW FROM created_at) as day_of_week,
      COUNT(*) as order_count,
      SUM(total_amount) as revenue,
      AVG(total_amount) as avg_order_value
    FROM orders
    WHERE status != 'cancelled'
    GROUP BY EXTRACT(HOUR FROM created_at), EXTRACT(DOW FROM created_at)
    ORDER BY order_count DESC
  `

  const result = await db.query(query)

  return res
    .status(200)
    .json(new apiResponse(200, result.rows, 'Peak order times fetched successfully'))
})

/**
 * ===== INVENTORY ANALYTICS =====
 */

// Get inventory analytics
export const getInventoryAnalytics = catchAsyncErrors(async (req, res, next) => {
  const query = `
    SELECT
      p.id,
      p.name,
      p.price,
      p.stock as current_stock,
      COUNT(DISTINCT oi.order_id) as times_ordered,
      SUM(oi.quantity) as total_sold,
      AVG(oi.quantity) as avg_quantity_per_order,
      CASE
        WHEN p.stock = 0 THEN 'Out of Stock'
        WHEN p.stock < 10 THEN 'Low Stock'
        WHEN p.stock < 50 THEN 'Medium Stock'
        ELSE 'Healthy Stock'
      END as stock_status,
      CASE
        WHEN COUNT(DISTINCT oi.order_id) > 100 THEN 'Fast Moving'
        WHEN COUNT(DISTINCT oi.order_id) > 50 THEN 'Popular'
        WHEN COUNT(DISTINCT oi.order_id) > 10 THEN 'Moderate'
        ELSE 'Slow Moving'
      END as movement_speed
    FROM products p
    LEFT JOIN order_items oi ON p.id = oi.product_id
    GROUP BY p.id, p.name, p.price, p.stock
    ORDER BY current_stock ASC
  `

  const result = await db.query(query)

  return res
    .status(200)
    .json(new apiResponse(200, result.rows, 'Inventory analytics fetched successfully'))
})

/**
 * ===== CONVERSION ANALYTICS =====
 */

// Get conversion funnel metrics
export const getConversionFunnel = catchAsyncErrors(async (req, res, next) => {
  const query = `
    SELECT
      'Product Views' as stage,
      COUNT(DISTINCT user_id) as unique_users,
      COUNT(*) as total_interactions
    FROM product_views
    UNION ALL
    SELECT
      'Cart Additions' as stage,
      COUNT(DISTINCT user_id) as unique_users,
      COUNT(*) as total_interactions
    FROM cart_items
    UNION ALL
    SELECT
      'Checkouts' as stage,
      COUNT(DISTINCT user_id) as unique_users,
      COUNT(*) as total_interactions
    FROM orders
    WHERE status != 'cancelled'
  `

  const result = await db.query(query)

  return res
    .status(200)
    .json(new apiResponse(200, result.rows, 'Conversion funnel fetched successfully'))
})

/**
 * ===== REVIEW & RATING ANALYTICS =====
 */

// Get review and rating statistics
export const getReviewAnalytics = catchAsyncErrors(async (req, res, next) => {
  const query = `
    SELECT
      AVG(rating) as avg_rating,
      COUNT(*) as total_reviews,
      COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
      COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
      COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star,
      COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star,
      COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star,
      COUNT(DISTINCT product_id) as rated_products,
      COUNT(DISTINCT user_id) as reviewers,
      COUNT(CASE WHEN helpful_count > 0 THEN 1 END) as helpful_reviews,
      AVG(helpful_count) as avg_helpful_votes
    FROM reviews
  `

  const result = await db.query(query)

  return res
    .status(200)
    .json(new apiResponse(200, result.rows[0], 'Review analytics fetched successfully'))
})

/**
 * ===== DASHBOARD SUMMARY =====
 */

// Get dashboard summary (all key metrics)
export const getDashboardSummary = catchAsyncErrors(async (req, res, next) => {
  const { startDate, endDate } = req.query

  const dateFilter = `
    ${startDate ? `WHERE created_at >= '${startDate}'` : ''}
    ${endDate ? `${startDate ? 'AND' : 'WHERE'} created_at <= '${endDate}'` : ''}
  `

  // Revenue
  const revenueQuery = `
    SELECT COALESCE(SUM(total_amount), 0) as total_revenue,
           COUNT(*) as total_orders,
           AVG(total_amount) as avg_order_value
    FROM orders
    WHERE status != 'cancelled'
    ${startDate ? `AND created_at >= $1` : ''}
    ${endDate ? `AND created_at <= $${startDate ? '2' : '1'}` : ''}
  `

  // Users
  const usersQuery = `
    SELECT COUNT(*) as total_users,
           COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as new_users_week
    FROM users
  `

  // Products
  const productsQuery = `
    SELECT COUNT(*) as total_products,
           COUNT(CASE WHEN stock = 0 THEN 1 END) as out_of_stock,
           AVG(price) as avg_price
    FROM products
  `

  // Orders
  const ordersQuery = `
    SELECT COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders,
           COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders
    FROM orders
  `

  const params = []
  if (startDate) params.push(new Date(startDate))
  if (endDate) params.push(new Date(endDate))

  const [revenueResult, usersResult, productsResult, ordersResult] = await Promise.all([
    db.query(revenueQuery, params),
    db.query(usersQuery),
    db.query(productsQuery),
    db.query(ordersQuery),
  ])

  const summary = {
    revenue: {
      total: parseFloat(revenueResult.rows[0].total_revenue) || 0,
      orders: parseInt(revenueResult.rows[0].total_orders) || 0,
      avgOrderValue: parseFloat(revenueResult.rows[0].avg_order_value) || 0,
    },
    users: {
      total: parseInt(usersResult.rows[0].total_users) || 0,
      newThisWeek: parseInt(usersResult.rows[0].new_users_week) || 0,
    },
    products: {
      total: parseInt(productsResult.rows[0].total_products) || 0,
      outOfStock: parseInt(productsResult.rows[0].out_of_stock) || 0,
      avgPrice: parseFloat(productsResult.rows[0].avg_price) || 0,
    },
    orders: {
      delivered: parseInt(ordersResult.rows[0].delivered_orders) || 0,
      cancelled: parseInt(ordersResult.rows[0].cancelled_orders) || 0,
    },
  }

  return res
    .status(200)
    .json(new apiResponse(200, summary, 'Dashboard summary fetched successfully'))
})

export default {
  getRevenueMetrics,
  getRevenueChart,
  getRevenueComparison,
  getTopProducts,
  getProductPerformance,
  getCategoryPerformance,
  getCustomerSegments,
  getCustomerLifetimeValue,
  getCohortAnalysis,
  getOrderMetrics,
  getOrderStatusDistribution,
  getOrderPeakTimes,
  getInventoryAnalytics,
  getConversionFunnel,
  getReviewAnalytics,
  getDashboardSummary,
}
