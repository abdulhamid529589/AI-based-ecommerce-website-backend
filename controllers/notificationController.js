import { catchAsyncErrors } from '../middlewares/catchAsyncError.js'
import ErrorHandler from '../middlewares/errorMiddleware.js'
import database from '../database/db.js'

/**
 * Create a notification for user
 */
export const createNotification = catchAsyncErrors(async (req, res, next) => {
  const { userId, type, title, message, data = {}, priority = 'normal' } = req.body

  if (!userId || !type || !title) {
    return next(new ErrorHandler('Missing required fields: userId, type, title', 400))
  }

  const query = `
    INSERT INTO notifications (
      user_id, type, title, message, data, priority, is_read, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, false, NOW())
    RETURNING *
  `

  const result = await database.query(query, [
    userId,
    type,
    title,
    message,
    JSON.stringify(data),
    priority,
  ])

  res.status(201).json({
    success: true,
    message: 'Notification created',
    data: result.rows[0],
  })
})

/**
 * Get user notifications
 */
export const getNotifications = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user?.id
  const { limit = 20, page = 1, filter = 'all' } = req.query

  if (!userId) {
    return next(new ErrorHandler('Unauthorized', 401))
  }

  const offset = (page - 1) * limit
  let whereClause = 'user_id = $1'
  let params = [userId]
  let paramIndex = 2

  if (filter === 'unread') {
    whereClause += ` AND is_read = false`
  }

  const countQuery = `SELECT COUNT(*) as total FROM notifications WHERE ${whereClause}`
  const countResult = await database.query(countQuery, params)
  const total = parseInt(countResult.rows[0].total)

  const query = `
    SELECT * FROM notifications
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `

  params.push(limit, offset)
  const result = await database.query(query, params)

  res.status(200).json({
    success: true,
    message: 'Notifications fetched',
    data: {
      notifications: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  })
})

/**
 * Mark notification as read
 */
export const markAsRead = catchAsyncErrors(async (req, res, next) => {
  const { notificationId } = req.params
  const userId = req.user?.id

  const query = `
    UPDATE notifications
    SET is_read = true, read_at = NOW()
    WHERE id = $1 AND user_id = $2
    RETURNING *
  `

  const result = await database.query(query, [notificationId, userId])

  if (result.rows.length === 0) {
    return next(new ErrorHandler('Notification not found', 404))
  }

  res.status(200).json({
    success: true,
    message: 'Notification marked as read',
    data: result.rows[0],
  })
})

/**
 * Mark all notifications as read
 */
export const markAllAsRead = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user?.id

  const query = `
    UPDATE notifications
    SET is_read = true, read_at = NOW()
    WHERE user_id = $1 AND is_read = false
    RETURNING COUNT(*) as updated
  `

  const result = await database.query(query, [userId])

  res.status(200).json({
    success: true,
    message: 'All notifications marked as read',
    data: {
      updated: result.rowCount,
    },
  })
})

/**
 * Delete a notification
 */
export const deleteNotification = catchAsyncErrors(async (req, res, next) => {
  const { notificationId } = req.params
  const userId = req.user?.id

  const query = `
    DELETE FROM notifications
    WHERE id = $1 AND user_id = $2
    RETURNING id
  `

  const result = await database.query(query, [notificationId, userId])

  if (result.rows.length === 0) {
    return next(new ErrorHandler('Notification not found', 404))
  }

  res.status(200).json({
    success: true,
    message: 'Notification deleted',
  })
})

/**
 * Get notification statistics
 */
export const getNotificationStats = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user?.id

  if (!userId) {
    return next(new ErrorHandler('Unauthorized', 401))
  }

  const query = `
    SELECT
      COUNT(*) as total_notifications,
      COUNT(CASE WHEN is_read = false THEN 1 END) as unread_count,
      COUNT(CASE WHEN type = 'order' THEN 1 END) as order_notifications,
      COUNT(CASE WHEN type = 'promotion' THEN 1 END) as promotion_notifications,
      COUNT(CASE WHEN type = 'system' THEN 1 END) as system_notifications,
      COUNT(CASE WHEN type = 'wishlist' THEN 1 END) as wishlist_notifications,
      COUNT(CASE WHEN priority = 'high' THEN 1 END) as high_priority_count
    FROM notifications
    WHERE user_id = $1
  `

  const result = await database.query(query, [userId])
  const stats = result.rows[0]

  res.status(200).json({
    success: true,
    message: 'Notification statistics fetched',
    data: {
      totalNotifications: parseInt(stats.total_notifications),
      unreadCount: parseInt(stats.unread_count),
      byType: {
        orders: parseInt(stats.order_notifications),
        promotions: parseInt(stats.promotion_notifications),
        system: parseInt(stats.system_notifications),
        wishlist: parseInt(stats.wishlist_notifications),
      },
      highPriorityCount: parseInt(stats.high_priority_count),
    },
  })
})

/**
 * Send notification for order status change
 */
export const notifyOrderStatusChange = catchAsyncErrors(async (req, res, next) => {
  const { orderId, status, buyerId } = req.body

  const statusMessages = {
    pending: 'Your order is being prepared',
    confirmed: 'Your order has been confirmed!',
    processing: 'Your order is being processed',
    shipped: 'Your order has been shipped!',
    delivered: 'Your order has been delivered!',
    cancelled: 'Your order has been cancelled',
    failed: 'Payment failed. Please try again',
  }

  const notification = await createNotificationRecord({
    userId: buyerId,
    type: 'order',
    title: `Order #${orderId} ${status}`,
    message: statusMessages[status] || `Order status changed to ${status}`,
    data: { orderId, status },
    priority: status === 'delivered' ? 'high' : 'normal',
  })

  res.status(201).json({
    success: true,
    message: 'Order notification sent',
    data: notification,
  })
})

/**
 * Send promotional notification
 */
export const sendPromotion = catchAsyncErrors(async (req, res, next) => {
  const { userIds, title, message, promotionData = {} } = req.body

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return next(new ErrorHandler('userIds must be a non-empty array', 400))
  }

  // Insert notifications in batch
  const values = userIds
    .map((id, idx) => {
      const paramStart = idx * 6 + 1
      return `($${paramStart}, 'promotion', $${paramStart + 1}, $${paramStart + 2}, $${paramStart + 3}, 'normal')`
    })
    .join(',')

  const query = `
    INSERT INTO notifications (user_id, type, title, message, data, priority)
    VALUES ${values}
    RETURNING COUNT(*) as sent
  `

  const params = []
  userIds.forEach((id) => {
    params.push(id, title, message, JSON.stringify(promotionData))
  })

  const result = await database.query(query, params)

  res.status(201).json({
    success: true,
    message: `Promotion sent to ${userIds.length} users`,
    data: {
      sentCount: userIds.length,
    },
  })
})

/**
 * Helper function to create notification record
 */
export const createNotificationRecord = async (notificationData) => {
  const { userId, type, title, message, data = {}, priority = 'normal' } = notificationData

  const query = `
    INSERT INTO notifications (
      user_id, type, title, message, data, priority, is_read, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, false, NOW())
    RETURNING *
  `

  const result = await database.query(query, [
    userId,
    type,
    title,
    message,
    JSON.stringify(data),
    priority,
  ])

  return result.rows[0]
}
