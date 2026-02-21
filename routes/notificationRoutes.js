import express from 'express'
import { isAuthenticated, authorizedRoles } from '../middlewares/authMiddleware.js'
import {
  createNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getNotificationStats,
  notifyOrderStatusChange,
  sendPromotion,
} from '../controllers/notificationController.js'

const router = express.Router()

/**
 * POST /api/v1/notifications
 * Create a new notification (Admin only)
 */
router.post('/', isAuthenticated, authorizedRoles('Admin'), createNotification)

/**
 * GET /api/v1/notifications
 * Get user notifications (Protected)
 */
router.get('/', isAuthenticated, getNotifications)

/**
 * GET /api/v1/notifications/stats
 * Get notification statistics (Protected)
 */
router.get('/stats', isAuthenticated, getNotificationStats)

/**
 * PUT /api/v1/notifications/:notificationId/read
 * Mark notification as read (Protected)
 */
router.put('/:notificationId/read', isAuthenticated, markAsRead)

/**
 * PUT /api/v1/notifications/read-all
 * Mark all notifications as read (Protected)
 */
router.put('/read-all', isAuthenticated, markAllAsRead)

/**
 * DELETE /api/v1/notifications/:notificationId
 * Delete a notification (Protected)
 */
router.delete('/:notificationId', isAuthenticated, deleteNotification)

/**
 * POST /api/v1/notifications/order-status-change
 * Notify user of order status change (Admin only)
 */
router.post(
  '/order-status-change',
  isAuthenticated,
  authorizedRoles('Admin'),
  notifyOrderStatusChange,
)

/**
 * POST /api/v1/notifications/promotion
 * Send promotional notification to users (Admin only)
 */
router.post('/promotion', isAuthenticated, authorizedRoles('Admin'), sendPromotion)

export default router
