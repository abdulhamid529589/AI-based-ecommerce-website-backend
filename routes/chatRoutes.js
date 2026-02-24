/**
 * Chat Routes
 * API endpoints for chat functionality
 */

import express from 'express'
import { isAuthenticated, authorizedRoles } from '../middlewares/authMiddleware.js'
import {
  getChatHistory,
  getAllConversations,
  getOnlineUsers,
  markAsRead,
  getUnreadCount,
  deleteMessage,
} from '../controllers/chatController.js'

const router = express.Router()

// Customer routes (requires authentication)
router.get('/history', isAuthenticated, getChatHistory)
router.post('/mark-read', isAuthenticated, markAsRead)
router.get('/unread-count', isAuthenticated, getUnreadCount)

// Admin routes (requires admin role)
router.get('/conversations', isAuthenticated, authorizedRoles('Admin'), getAllConversations)
router.get('/online-users', isAuthenticated, authorizedRoles('Admin'), getOnlineUsers)

// Delete message (owner or admin)
router.delete('/message/:messageId', isAuthenticated, deleteMessage)

export default router
