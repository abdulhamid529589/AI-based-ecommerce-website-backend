import { catchAsyncErrors } from '../middlewares/catchAsyncError.js'
import ErrorHandler from '../middlewares/errorMiddleware.js'
import database from '../database/db.js'

/**
 * Get revenue analytics with time-series data
 * Query params: period (days), groupBy (day/week/month)
 */
export const getRevenueAnalytics = catchAsyncErrors(async (req, res, next) => {
  const { period = '30', groupBy = 'day' } = req.query
  const periodDays = parseInt(period) || 30

  const query = `
    SELECT
      DATE_TRUNC($1, created_at) as period_date,
      COUNT(*) as order_count,
      COALESCE(SUM(total_price), 0) as daily_revenue,
      COALESCE(AVG(total_price), 0) as avg_order_value,
      COALESCE(SUM(tax_price), 0) as tax_collected,
      COALESCE(SUM(shipping_price), 0) as shipping_revenue
    FROM orders
    WHERE created_at >= NOW() - INTERVAL '${periodDays} days'
    GROUP BY DATE_TRUNC($1, created_at)
    ORDER BY period_date DESC
  `

  const result = await database.query(query, [groupBy])

  // Calculate summary metrics
  const totalRevenue = result.rows.reduce((sum, row) => sum + parseFloat(row.daily_revenue), 0)
  const totalOrders = result.rows.reduce((sum, row) => sum + parseInt(row.order_count), 0)
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0

  // Calculate growth
  const currentPeriodRevenue = result.rows
    .slice(0, Math.floor(result.rows.length / 2))
    .reduce((sum, row) => sum + parseFloat(row.daily_revenue), 0)
  const previousPeriodRevenue = result.rows
    .slice(Math.floor(result.rows.length / 2))
    .reduce((sum, row) => sum + parseFloat(row.daily_revenue), 0)
  const growthPercentage =
    previousPeriodRevenue > 0
      ? (((currentPeriodRevenue - previousPeriodRevenue) / previousPeriodRevenue) * 100).toFixed(2)
      : 0

  res.status(200).json({
    success: true,
    message: 'Revenue analytics fetched successfully',
    data: {
      labels: result.rows.map((r) => new Date(r.period_date).toLocaleDateString()),
      revenue: result.rows.map((r) => parseFloat(r.daily_revenue)),
      orders: result.rows.map((r) => parseInt(r.order_count)),
      averageOrderValue: result.rows.map((r) => parseFloat(r.avg_order_value)),
      rawData: result.rows,
      metrics: {
        totalRevenue: totalRevenue.toFixed(2),
        totalOrders,
        averageOrderValue: avgOrderValue.toFixed(2),
        growth: `${growthPercentage}%`,
        trend: growthPercentage >= 0 ? 'UP' : 'DOWN',
      },
    },
  })
})

/**
 * Get category-wise sales analytics
 */
export const getCategorySalesAnalytics = catchAsyncErrors(async (req, res, next) => {
  const query = `
    SELECT
      p.category,
      COUNT(oi.id) as total_sales,
      COALESCE(SUM(oi.price * oi.quantity), 0) as total_revenue,
      COALESCE(AVG(oi.price), 0) as avg_price,
      COUNT(DISTINCT oi.order_id) as unique_orders,
      COALESCE(SUM(p.stock), 0) as current_stock
    FROM order_items oi
    JOIN products p ON oi.product_id = p.id
    GROUP BY p.category
    ORDER BY total_revenue DESC
  `

  const result = await database.query(query)

  const totalRevenue = result.rows.reduce((sum, row) => sum + parseFloat(row.total_revenue), 0)

  res.status(200).json({
    success: true,
    message: 'Category sales analytics fetched successfully',
    data: {
      categories: result.rows.map((r) => r.category),
      sales: result.rows.map((r) => parseInt(r.total_sales)),
      revenue: result.rows.map((r) => parseFloat(r.total_revenue)),
      percentages: result.rows.map((r) =>
        ((parseFloat(r.total_revenue) / totalRevenue) * 100).toFixed(2),
      ),
      rawData: result.rows,
      metrics: {
        totalCategories: result.rows.length,
        totalRevenue: totalRevenue.toFixed(2),
        topCategory: result.rows[0]?.category || 'N/A',
        topCategoryRevenue: parseFloat(result.rows[0]?.total_revenue || 0).toFixed(2),
      },
    },
  })
})

/**
 * Get customer lifecycle analytics
 */
export const getCustomerAnalytics = catchAsyncErrors(async (req, res, next) => {
  const { customerId } = req.query

  if (!customerId) {
    return next(new ErrorHandler('Customer ID is required', 400))
  }

  // Customer order history
  const orderQuery = `
    SELECT
      o.id,
      o.total_price,
      o.order_status,
      o.created_at,
      COUNT(oi.id) as item_count
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    WHERE o.buyer_id = $1
    GROUP BY o.id
    ORDER BY o.created_at DESC
  `

  const orders = await database.query(orderQuery, [customerId])

  // Customer stats
  const statsQuery = `
    SELECT
      COUNT(*) as total_orders,
      COALESCE(SUM(total_price), 0) as lifetime_value,
      COALESCE(AVG(total_price), 0) as avg_order_value,
      MAX(created_at) as last_order_date,
      MIN(created_at) as first_order_date,
      CASE
        WHEN COUNT(*) >= 10 THEN 'VIP'
        WHEN COUNT(*) >= 5 THEN 'Loyal'
        WHEN COUNT(*) >= 2 THEN 'Active'
        ELSE 'New'
      END as segment
    FROM orders
    WHERE buyer_id = $1
  `

  const stats = await database.query(statsQuery, [customerId])

  res.status(200).json({
    success: true,
    message: 'Customer analytics fetched successfully',
    data: {
      customerId,
      stats: stats.rows[0],
      orders: orders.rows,
      metrics: {
        totalOrders: parseInt(stats.rows[0]?.total_orders || 0),
        lifetimeValue: parseFloat(stats.rows[0]?.lifetime_value || 0).toFixed(2),
        averageOrderValue: parseFloat(stats.rows[0]?.avg_order_value || 0).toFixed(2),
        lastOrderDate: stats.rows[0]?.last_order_date,
        firstOrderDate: stats.rows[0]?.first_order_date,
        segment: stats.rows[0]?.segment,
      },
    },
  })
})

/**
 * Get product performance analytics
 */
export const getProductAnalytics = catchAsyncErrors(async (req, res, next) => {
  const query = `
    SELECT
      p.id,
      p.name,
      p.category,
      p.price,
      p.stock,
      COALESCE(COUNT(oi.id), 0) as times_ordered,
      COALESCE(SUM(oi.quantity), 0) as total_quantity_sold,
      COALESCE(SUM(oi.price * oi.quantity), 0) as total_revenue,
      COALESCE(AVG(p.ratings), 0) as avg_rating,
      COALESCE(COUNT(DISTINCT oi.order_id), 0) as unique_customers,
      COALESCE(ROUND((COUNT(oi.id)::float / (SELECT COUNT(*) FROM orders) * 100), 2), 0) as conversion_rate
    FROM products p
    LEFT JOIN order_items oi ON p.id = oi.product_id
    GROUP BY p.id, p.name, p.category, p.price, p.stock, p.ratings
    ORDER BY total_revenue DESC
    LIMIT 50
  `

  const result = await database.query(query)

  res.status(200).json({
    success: true,
    message: 'Product analytics fetched successfully',
    data: {
      products: result.rows,
      metrics: {
        totalProducts: result.rows.length,
        topProduct: result.rows[0]?.name || 'N/A',
        topProductRevenue: parseFloat(result.rows[0]?.total_revenue || 0).toFixed(2),
        averageProductRevenue: (
          result.rows.reduce((sum, p) => sum + parseFloat(p.total_revenue), 0) / result.rows.length
        ).toFixed(2),
      },
    },
  })
})

/**
 * Get order status distribution
 */
export const getOrderStatusAnalytics = catchAsyncErrors(async (req, res, next) => {
  const query = `
    SELECT
      order_status,
      COUNT(*) as count,
      COALESCE(SUM(total_price), 0) as revenue,
      ROUND((COUNT(*)::float / (SELECT COUNT(*) FROM orders) * 100), 2) as percentage
    FROM orders
    GROUP BY order_status
    ORDER BY count DESC
  `

  const result = await database.query(query)

  res.status(200).json({
    success: true,
    message: 'Order status analytics fetched successfully',
    data: {
      statuses: result.rows.map((r) => r.order_status),
      counts: result.rows.map((r) => parseInt(r.count)),
      revenues: result.rows.map((r) => parseFloat(r.revenue)),
      percentages: result.rows.map((r) => parseFloat(r.percentage)),
      rawData: result.rows,
    },
  })
})

/**
 * Get payment method analytics
 */
export const getPaymentMethodAnalytics = catchAsyncErrors(async (req, res, next) => {
  const query = `
    SELECT
      p.payment_method,
      COUNT(*) as total_transactions,
      COALESCE(SUM(p.amount), 0) as total_amount,
      COALESCE(COUNT(CASE WHEN p.payment_status = 'Paid' THEN 1 END), 0) as successful,
      COALESCE(COUNT(CASE WHEN p.payment_status != 'Paid' THEN 1 END), 0) as failed,
      ROUND((COUNT(CASE WHEN p.payment_status = 'Paid' THEN 1 END)::float / COUNT(*) * 100), 2) as success_rate
    FROM payments p
    GROUP BY p.payment_method
    ORDER BY total_amount DESC
  `

  const result = await database.query(query)

  res.status(200).json({
    success: true,
    message: 'Payment method analytics fetched successfully',
    data: {
      methods: result.rows.map((r) => r.payment_method),
      transactions: result.rows.map((r) => parseInt(r.total_transactions)),
      amounts: result.rows.map((r) => parseFloat(r.total_amount)),
      successRates: result.rows.map((r) => parseFloat(r.success_rate)),
      rawData: result.rows,
    },
  })
})
