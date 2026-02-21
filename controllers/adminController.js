import ErrorHandler from '../middlewares/errorMiddleware.js'
import { catchAsyncErrors } from '../middlewares/catchAsyncError.js'
import database from '../database/db.js'
import { v2 as cloudinary } from 'cloudinary'

export const getAllUsers = catchAsyncErrors(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1

  // Get total count of ALL users (including admins)
  const totalUsersResult = await database.query('SELECT COUNT(*) FROM users')

  const totalUsers = parseInt(totalUsersResult.rows[0].count)

  const offset = (page - 1) * 10

  // Fetch all users regardless of role (Users and Admins)
  const users = await database.query(
    'SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [10, offset],
  )
  res.status(200).json({
    success: true,
    totalUsers,
    currentPage: page,
    users: users.rows,
  })
})

export const deleteUser = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params

  const deleteUser = await database.query('DELETE FROM users WHERE id = $1 RETURNING *', [id])

  if (deleteUser.rows.length === 0) {
    return next(new ErrorHandler('User not found', 404))
  }

  const avatar = deleteUser.rows[0].avatar
  if (avatar?.public_id) {
    await cloudinary.uploader.destroy(avatar.public_id)
  }

  res.status(200).json({
    success: true,
    message: 'User deleted successfully',
  })
})

export const updateUser = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params
  const { name, email, password } = req.body

  // Validate input
  if (!name && !email && !password) {
    return next(new ErrorHandler('Please provide at least one field to update', 400))
  }

  // Check if user exists
  const userExists = await database.query('SELECT * FROM users WHERE id = $1', [id])
  if (userExists.rows.length === 0) {
    return next(new ErrorHandler('User not found', 404))
  }

  // Check if email already exists (if being updated)
  if (email && email !== userExists.rows[0].email) {
    const emailExists = await database.query('SELECT * FROM users WHERE email = $1', [email])
    if (emailExists.rows.length > 0) {
      return next(new ErrorHandler('Email already in use', 400))
    }
  }

  // Prepare update fields
  let updateFields = []
  let values = []
  let index = 1

  if (name) {
    if (name.length < 3) {
      return next(new ErrorHandler('Name must be at least 3 characters long', 400))
    }
    updateFields.push(`name = $${index}`)
    values.push(name)
    index++
  }

  if (email) {
    updateFields.push(`email = $${index}`)
    values.push(email)
    index++
  }

  if (password) {
    if (password.length < 8) {
      return next(new ErrorHandler('Password must be at least 8 characters long', 400))
    }
    // ✅ CRITICAL FIX: Hash password before storing
    const hashedPassword = await bcrypt.hash(password, 10)
    updateFields.push(`password = $${index}`)
    values.push(hashedPassword) // ✅ Store hashed password, NOT plain text
    index++
  }

  values.push(id)
  const query = `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${index} RETURNING id, name, email, role, created_at`

  const result = await database.query(query, values)

  res.status(200).json({
    success: true,
    message: 'User updated successfully',
    user: result.rows[0],
  })
})

export const dashboardStats = catchAsyncErrors(async (req, res, next) => {
  const today = new Date()
  const todayDate = today.toISOString().split('T')[0]
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const yesterdayDate = yesterday.toISOString().split('T')[0]

  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const currentMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)

  const previousMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)

  const previousMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)

  const totalRevenueAllTimeQuery = await database.query(`
    SELECT SUM(total_price) FROM orders
    `)
  const totalRevenueAllTime = parseFloat(totalRevenueAllTimeQuery.rows[0].sum) || 0

  // Total Users
  const totalUsersCountQuery = await database.query(`
    SELECT COUNT(*) FROM users WHERE role = 'User'`)

  const totalUsersCount = parseInt(totalUsersCountQuery.rows[0].count) || 0

  // Order Status Counts
  const orderStatusCountsQuery = await database.query(`
      SELECT order_status, COUNT(*) FROM orders GROUP BY order_status
      `)

  const orderStatusCounts = {
    Processing: 0,
    Shipped: 0,
    Delivered: 0,
    Cancelled: 0,
  }
  orderStatusCountsQuery.rows.forEach((row) => {
    orderStatusCounts[row.order_status] = parseInt(row.count)
  })

  // Today's Revenue
  const todayRevenueQuery = await database.query(
    `
    SELECT SUM(total_price) FROM orders WHERE created_at::date = $1
    `,
    [todayDate],
  )
  const todayRevenue = parseFloat(todayRevenueQuery.rows[0].sum) || 0

  // Yesterday's Revenue
  const yesterdayRevenueQuery = await database.query(
    `
    SELECT SUM(total_price) FROM orders WHERE created_at::date = $1
    `,
    [yesterdayDate],
  )
  const yesterdayRevenue = parseFloat(yesterdayRevenueQuery.rows[0].sum) || 0

  //Monthly Sales For Line Chart
  const monthlySalesQuery = await database.query(`
    SELECT
    TO_CHAR(created_at, 'Mon YYYY') AS month,
    DATE_TRUNC('month', created_at) as date,
    SUM(total_price) as totalsales,
    COUNT(*) as orders
    FROM orders
    GROUP BY month, date
    ORDER BY date ASC
    `)

  const monthlySales = monthlySalesQuery.rows.map((row) => ({
    month: row.month,
    totalsales: parseFloat(row.totalsales) || 0,
  }))

  // Top 5 Most Sold Products
  const topSellingProductsQuery = await database.query(`
    SELECT p.name,
    p.images->0->>'url' AS image,
    p.category,
    p.ratings,
    SUM(oi.quantity) AS total_sold
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    JOIN orders o ON o.id = oi.order_id
    GROUP BY p.name, p.images, p.category, p.ratings
    ORDER BY total_sold DESC
    LIMIT 5
  `)

  const topSellingProducts = topSellingProductsQuery.rows

  // Total Sales of Current Month
  const currentMonthSalesQuery = await database.query(
    `
      SELECT SUM(total_price) AS total
      FROM orders
      WHERE created_at BETWEEN $1 AND $2
      `,
    [currentMonthStart, currentMonthEnd],
  )

  const currentMonthSales = parseFloat(currentMonthSalesQuery.rows[0].total) || 0

  // Products with stock less than or equal to 5
  const lowStockProductsQuery = await database.query(`
        SELECT name, stock FROM products WHERE stock <= 5
      `)

  const lowStockProducts = lowStockProductsQuery.rows

  // Revenue Growth Rate (%)
  const lastMonthRevenueQuery = await database.query(
    `
      SELECT SUM(total_price) AS total
      FROM orders
      WHERE created_at BETWEEN $1 AND $2
    `,
    [previousMonthStart, previousMonthEnd],
  )

  const lastMonthRevenue = parseFloat(lastMonthRevenueQuery.rows[0].total) || 0

  let revenueGrowth = '0%'

  if (lastMonthRevenue > 0) {
    const growthRate = ((currentMonthSales - lastMonthRevenue) / lastMonthRevenue) * 100
    revenueGrowth = `${growthRate >= 0 ? '+' : ''}${growthRate.toFixed(2)}%`
  }

  // New Users This Month
  const newUsersThisMonthQuery = await database.query(
    `
    SELECT COUNT(*) FROM users WHERE created_at >= $1 AND role = 'User'
  `,
    [currentMonthStart],
  )

  const newUsersThisMonth = parseInt(newUsersThisMonthQuery.rows[0].count) || 0

  // Calculate total orders
  const totalOrdersQuery = await database.query(`
    SELECT COUNT(*) FROM orders
  `)
  const totalOrders = parseInt(totalOrdersQuery.rows[0].count) || 0

  // FINAL RESPONSE
  res.status(200).json({
    success: true,
    message: 'Dashboard Stats Fetched Successfully',
    data: {
      totalOrders,
      totalRevenue: totalRevenueAllTime,
      totalCustomers: totalUsersCount,
      totalRevenueAllTime,
      todayRevenue,
      yesterdayRevenue,
      totalUsersCount,
      orderStatusCounts,
      monthlySales,
      currentMonthSales,
      topSellingProducts,
      lowStockProducts,
      revenueGrowth,
      newUsersThisMonth,
    },
    timestamp: new Date().toISOString(),
  })
})
export const getRevenueAnalytics = catchAsyncErrors(async (req, res, next) => {
  // Get monthly revenue data for charts
  const result = await database.query(`
    SELECT
      DATE_TRUNC('month', created_at) as month,
      SUM(total_price) as revenue,
      COUNT(*) as orders
    FROM orders
    WHERE created_at >= NOW() - INTERVAL '12 months'
    GROUP BY DATE_TRUNC('month', created_at)
    ORDER BY month DESC
  `)

  const analyticsData = result.rows.map((row) => ({
    month: row.month ? new Date(row.month).toLocaleDateString() : 'Unknown',
    revenue: parseFloat(row.revenue) || 0,
    orders: parseInt(row.orders) || 0,
  }))

  res.status(200).json({
    success: true,
    data: analyticsData,
  })
})

export const getCategorySalesAnalytics = catchAsyncErrors(async (req, res, next) => {
  // Get sales by category
  const result = await database.query(`
    SELECT
      p.category,
      COUNT(oi.id) as sales,
      SUM(oi.quantity) as quantity,
      SUM(oi.price * oi.quantity) as revenue
    FROM order_items oi
    JOIN products p ON oi.product_id = p.id
    GROUP BY p.category
    ORDER BY revenue DESC
  `)

  const analyticsData = result.rows.map((row) => ({
    category: row.category || 'Uncategorized',
    sales: parseInt(row.sales) || 0,
    quantity: parseInt(row.quantity) || 0,
    revenue: parseFloat(row.revenue) || 0,
  }))

  res.status(200).json({
    success: true,
    data: analyticsData,
  })
})

export const getCustomerOrders = catchAsyncErrors(async (req, res, next) => {
  const { customerId } = req.params

  // Validate customer exists
  const customerExists = await database.query('SELECT * FROM users WHERE id = $1', [customerId])
  if (customerExists.rows.length === 0) {
    return next(new ErrorHandler('Customer not found', 404))
  }

  // Fetch customer's orders
  const result = await database.query(
    `
    SELECT
      o.*,
      COUNT(oi.id) as item_count,
      s.city,
      s.state
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    LEFT JOIN shipping_info s ON o.id = s.order_id
    WHERE o.buyer_id = $1
    GROUP BY o.id, s.id
    ORDER BY o.created_at DESC
    `,
    [customerId],
  )

  res.status(200).json({
    success: true,
    orders: result.rows,
    totalOrders: result.rows.length,
  })
})

export const getDashboardActivityFeed = catchAsyncErrors(async (req, res, next) => {
  // Get recent activity (orders, new users, new reviews)
  const recentOrders = await database.query(`
    SELECT
      o.id,
      o.created_at as timestamp,
      'order' as type,
      u.name as user_name,
      o.total_price as amount,
      o.order_status as status
    FROM orders o
    JOIN users u ON o.buyer_id = u.id
    ORDER BY o.created_at DESC
    LIMIT 5
  `)

  const newUsers = await database.query(`
    SELECT
      id,
      created_at as timestamp,
      'user' as type,
      name as user_name,
      email
    FROM users
    WHERE role = 'User'
    ORDER BY created_at DESC
    LIMIT 5
  `)

  const newReviews = await database.query(`
    SELECT
      pr.id,
      pr.created_at as timestamp,
      'review' as type,
      u.name as user_name,
      p.name as product_name,
      pr.rating
    FROM product_reviews pr
    JOIN users u ON pr.user_id = u.id
    JOIN products p ON pr.product_id = p.id
    ORDER BY pr.created_at DESC
    LIMIT 5
  `)

  const activity = [
    ...recentOrders.rows.map((r) => ({
      ...r,
      icon: 'ShoppingCart',
      description: `Order #${r.id.substring(0, 8)} - ₳${r.amount}`,
    })),
    ...newUsers.rows.map((u) => ({
      ...u,
      icon: 'Users',
      description: `New user: ${u.user_name}`,
    })),
    ...newReviews.rows.map((r) => ({
      ...r,
      icon: 'Star',
      description: `${r.user_name} reviewed ${r.product_name}`,
    })),
  ]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 10)

  res.status(200).json({
    success: true,
    activity,
  })
})
