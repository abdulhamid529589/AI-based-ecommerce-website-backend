/**
 * Chat Routes
 * Real-time messaging between customers and owner
 */

import express from 'express'
import { isAuthenticated, authorizedRoles } from '../middlewares/authMiddleware.js'
import {
  getUserChats,
  getOwnerChats,
  getMessages,
  startChat,
  closeChatConversation,
} from '../controllers/chatController.js'

const router = express.Router()

// ✅ All routes require authentication
router.use(isAuthenticated)

// Customer routes
router.get('/conversations', getUserChats) // Get user's conversations
router.post('/start', startChat) // Start new chat
router.get('/:conversationId/messages', getMessages) // Get conversation messages

// Owner/Admin routes
router.get('/admin/conversations', authorizedRoles('Admin'), getOwnerChats) // Get all conversations
router.put('/:conversationId/close', closeChatConversation) // Close conversation

export default router
