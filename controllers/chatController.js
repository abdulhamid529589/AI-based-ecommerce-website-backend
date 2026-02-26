/**
 * Chat Controller
 * Handles chat API endpoints
 */

import {
  getOrCreateConversation,
  getUserConversations,
  getOwnerConversations,
  getConversationMessages,
  markMessagesAsRead,
  closeConversation,
} from '../database/chat.js'

/**
 * Get user's conversations
 */
export const getUserChats = async (req, res) => {
  try {
    const userId = req.user.id
    const conversations = await getUserConversations(userId)

    res.status(200).json({
      success: true,
      conversations: conversations || [],
      count: conversations.length,
    })
  } catch (error) {
    console.error('[CHAT] Error getting user conversations:', error.message)
    res.status(500).json({
      success: false,
      message: 'Error fetching conversations',
    })
  }
}

/**
 * Get owner's conversations
 */
export const getOwnerChats = async (req, res) => {
  try {
    const userId = req.user.id

    // Check if user is admin/owner
    if (req.user.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can view all conversations',
      })
    }

    const conversations = await getOwnerConversations(userId)

    res.status(200).json({
      success: true,
      conversations: conversations || [],
      count: conversations.length,
    })
  } catch (error) {
    console.error('[CHAT] Error getting owner conversations:', error.message)
    res.status(500).json({
      success: false,
      message: 'Error fetching conversations',
    })
  }
}

/**
 * Get conversation messages
 */
export const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params
    const userId = req.user.id

    // Mark messages as read
    await markMessagesAsRead(conversationId, userId)

    const messages = await getConversationMessages(conversationId)

    res.status(200).json({
      success: true,
      messages: messages || [],
      count: messages.length,
    })
  } catch (error) {
    console.error('[CHAT] Error getting messages:', error.message)
    res.status(500).json({
      success: false,
      message: 'Error fetching messages',
    })
  }
}

/**
 * Get or create conversation
 */
export const startChat = async (req, res) => {
  try {
    const userId = req.user.id
    const { subject } = req.body

    const conversationId = await getOrCreateConversation(userId, subject || 'Support')

    res.status(200).json({
      success: true,
      conversationId,
      message: 'Chat started',
    })
  } catch (error) {
    console.error('[CHAT] Error starting chat:', error.message)
    res.status(500).json({
      success: false,
      message: 'Error starting chat',
    })
  }
}

/**
 * Close conversation
 */
export const closeChatConversation = async (req, res) => {
  try {
    const { conversationId } = req.params
    const userId = req.user.id

    // Verify ownership
    const conversation = await getOwnerConversations(userId)
    const isOwner = conversation.some((c) => c.id === conversationId)

    if (!isOwner && req.user.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to close this conversation',
      })
    }

    await closeConversation(conversationId)

    res.status(200).json({
      success: true,
      message: 'Conversation closed',
    })
  } catch (error) {
    console.error('[CHAT] Error closing conversation:', error.message)
    res.status(500).json({
      success: false,
      message: 'Error closing conversation',
    })
  }
}

export default {
  getUserChats,
  getOwnerChats,
  getMessages,
  startChat,
  closeChatConversation,
}
