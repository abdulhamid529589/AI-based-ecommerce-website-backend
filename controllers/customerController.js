/**
 * Customer Controller
 * Handles customer-specific operations: orders, profile, dashboard
 */

import database from '../database/db.js'
import { catchAsyncErrors } from '../middlewares/catchAsyncError.js'
import ErrorHandler from '../middlewares/errorMiddleware.js'

/**
 * Get customer's order history
 * GET /api/v1/customer/orders
 */
export const getCustomerOrders = catchAsyncErrors(async (req, res, next) => {
  const { page = 1, limit = 10, status } = req.query
  const userId = req.user.id

  const offset = (page - 1) * limit

  try {
    // Build query based on filters
    let countQuery = 'SELECT COUNT(*) FROM orders WHERE buyer_id = $1'
    let dataQuery = `
      SELECT id, order_status, total_price, created_at
      FROM orders
      WHERE buyer_id = $1
    `
    const params = [userId]

    // Add status filter if provided
    if (status) {
      countQuery += ' AND order_status = $2'
      dataQuery += ' AND order_status = $2'
      params.push(status)
    }

    // Count total records
    const countResult = await database.query(countQuery, params)
    const totalOrders = parseInt(countResult.rows[0].count)

    // Fetch paginated orders
    dataQuery +=
      ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2)
    params.push(limit, offset)

    const result = await database.query(dataQuery, params)

    res.status(200).json({
      success: true,
      data: {
        orders: result.rows,
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalOrders,
        pages: Math.ceil(totalOrders / limit),
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('❌ Error fetching customer orders:', error.message)
    return next(new ErrorHandler('Failed to fetch orders', 500))
  }
})

/**
 * Get customer's dashboard stats
 * GET /api/v1/customer/dashboard
 */
export const getCustomerDashboard = catchAsyncErrors(async (req, res, next) => {
  console.log('📊 Dashboard endpoint called')
  console.log('   req.user:', req.user ? `User ID: ${req.user.id}` : 'UNDEFINED')

  const userId = req.user?.id

  if (!userId) {
    console.error('❌ User ID not found in request')
    return next(new ErrorHandler('Authentication required', 401))
  }

  try {
    // Get order counts by status
    const statsQuery = `
      SELECT
        COUNT(*) AS total_orders,
        SUM(CASE WHEN order_status = 'Processing' THEN 1 ELSE 0 END) AS pending_orders,
        SUM(CASE WHEN order_status = 'Delivered' THEN 1 ELSE 0 END) AS delivered_orders,
        COALESCE(SUM(total_price), 0) AS total_spent
      FROM orders
      WHERE buyer_id = $1
    `

    console.log('   Executing stats query for user:', userId)
    const statsResult = await database.query(statsQuery, [userId])
    const stats = statsResult.rows[0]
    console.log('   Stats result:', stats)

    // Get recent orders (last 5)
    const recentOrdersQuery = `
      SELECT id, order_status, total_price, created_at
      FROM orders
      WHERE buyer_id = $1
      ORDER BY created_at DESC
      LIMIT 5
    `

    console.log('   Executing recent orders query')
    const recentResult = await database.query(recentOrdersQuery, [userId])
    console.log('   Recent orders found:', recentResult.rows.length)

    // Get wishlist count
    const wishlistQuery = 'SELECT COUNT(*) FROM wishlist_items WHERE user_id = $1'
    console.log('   Executing wishlist query')
    const wishlistResult = await database.query(wishlistQuery, [userId])
    const wishlistCount = parseInt(wishlistResult.rows[0].count)
    console.log('   Wishlist count:', wishlistCount)

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalOrders: parseInt(stats.total_orders) || 0,
          pendingOrders: parseInt(stats.pending_orders) || 0,
          deliveredOrders: parseInt(stats.delivered_orders) || 0,
          totalSpent: parseFloat(stats.total_spent) || 0,
        },
        recentOrders: recentResult.rows,
        wishlistCount,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('❌ Error fetching dashboard:', error.message)
    console.error('   Stack:', error.stack)
    return next(new ErrorHandler('Failed to fetch dashboard', 500))
  }
})

/**
 * Get single order details
 * GET /api/v1/customer/orders/:orderId
 */
export const getOrderDetails = catchAsyncErrors(async (req, res, next) => {
  const { orderId } = req.params
  const userId = req.user.id

  try {
    // Fetch order (verify it belongs to user)
    const orderQuery = `
      SELECT * FROM orders
      WHERE id = $1 AND buyer_id = $2
    `

    const orderResult = await database.query(orderQuery, [orderId, userId])

    if (orderResult.rows.length === 0) {
      return next(new ErrorHandler('Order not found', 404))
    }

    const order = orderResult.rows[0]

    // Fetch order items
    const itemsQuery = `
      SELECT oi.*, p.name, p.price
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = $1
    `

    const itemsResult = await database.query(itemsQuery, [orderId])

    res.status(200).json({
      success: true,
      data: {
        order: {
          ...order,
          items: itemsResult.rows,
        },
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('❌ Error fetching order details:', error.message)
    return next(new ErrorHandler('Failed to fetch order details', 500))
  }
})

/**
 * Get customer profile
 * GET /api/v1/customer/profile
 */
export const getCustomerProfile = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user.id

  try {
    const query = `
      SELECT id, name, email, created_at
      FROM users
      WHERE id = $1
    `

    const result = await database.query(query, [userId])

    if (result.rows.length === 0) {
      return next(new ErrorHandler('Customer not found', 404))
    }

    res.status(200).json({
      success: true,
      data: result.rows[0],
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('❌ Error fetching customer profile:', error.message)
    return next(new ErrorHandler('Failed to fetch profile', 500))
  }
})

/**
 * Update customer profile
 * PUT /api/v1/customer/profile
 */
export const updateCustomerProfile = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user.id
  const { name, email, phone } = req.body

  try {
    // Build dynamic update query
    const updates = []
    const params = [userId]
    let paramCount = 2

    if (name) {
      updates.push(`name = $${paramCount}`)
      params.push(name)
      paramCount++
    }

    if (email) {
      updates.push(`email = $${paramCount}`)
      params.push(email)
      paramCount++
    }

    if (phone) {
      updates.push(`mobile = $${paramCount}`)
      params.push(phone)
      paramCount++
    }

    if (updates.length === 0) {
      return next(new ErrorHandler('No fields to update', 400))
    }

    const query = `
      UPDATE users
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, name, email, created_at
    `
    params.push(userId)

    const result = await database.query(query, params)

    res.status(200).json({
      success: true,
      data: result.rows[0],
      message: 'Profile updated successfully',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('❌ Error updating profile:', error.message)
    return next(new ErrorHandler('Failed to update profile', 500))
  }
})

/**
 * Get customer addresses (if stored in separate table)
 * GET /api/v1/customer/addresses
 */
export const getCustomerAddresses = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user.id

  try {
    // Get addresses from shipping_info linked to user's orders
    const query = `
      SELECT DISTINCT
        s.full_name, s.state, s.city, s.country, s.address, s.pincode, s.phone
      FROM shipping_info s
      JOIN orders o ON s.order_id = o.id
      WHERE o.buyer_id = $1
      ORDER BY s.created_at DESC
    `

    const result = await database.query(query, [userId])

    res.status(200).json({
      success: true,
      data: result.rows,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('❌ Error fetching addresses:', error.message)
    return next(new ErrorHandler('Failed to fetch addresses', 500))
  }
})
