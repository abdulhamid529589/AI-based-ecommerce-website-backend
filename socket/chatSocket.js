/**
 * Chat Socket.io Handlers
 * Real-time messaging with Socket.io
 */

import { createLogger } from '../utils/logger.js'
import {
  getOrCreateConversation,
  saveMessage,
  getConversationMessages,
  markMessagesAsRead,
} from '../database/chat.js'

const logger = createLogger('Chat.Socket')

// Track active chat users
const activeChatUsers = new Map()

/**
 * Initialize chat socket handlers
 */
export function initializeChatSocket(io) {
  // Chat namespace
  const chatNamespace = io.of('/chat')

  chatNamespace.on('connection', (socket) => {
    logger.info('💬 User connected to chat', {
      socketId: socket.id,
      userId: socket.handshake.auth.userId,
    })

    /**
     * User joins their chat room
     */
    socket.on('join-chat', async (data) => {
      try {
        const { userId, conversationId } = data

        if (!userId) {
          socket.emit('error', { message: 'User ID required' })
          return
        }

        // Join user to their conversation room
        socket.join(`conversation:${conversationId}`)
        activeChatUsers.set(socket.id, { userId, conversationId })

        logger.info('👤 User joined chat room', {
          socketId: socket.id,
          conversationId,
          userId,
        })

        // Get conversation history
        const messages = await getConversationMessages(conversationId, 50)
        socket.emit('chat-history', {
          messages,
          conversationId,
        })

        // Notify others in room that user is online
        chatNamespace
          .to(`conversation:${conversationId}`)
          .emit('user-online', { userId, timestamp: new Date() })
      } catch (error) {
        logger.error('Error in join-chat:', error, { socketId: socket.id })
        socket.emit('error', { message: 'Error joining chat' })
      }
    })

    /**
     * Receive and broadcast message
     */
    socket.on('send-message', async (data) => {
      try {
        const { conversationId, message, userId, isOwner } = data

        if (!message || !conversationId || !userId) {
          socket.emit('error', { message: 'Missing required fields' })
          return
        }

        // Save message to database
        const savedMessage = await saveMessage(conversationId, userId, message, isOwner)

        logger.info('💬 Message sent', {
          conversationId,
          messageId: savedMessage.id,
          userId,
          isOwner,
        })

        // Broadcast message to all users in conversation room
        chatNamespace.to(`conversation:${conversationId}`).emit('new-message', {
          id: savedMessage.id,
          conversationId,
          senderId: userId,
          message,
          isOwner,
          createdAt: savedMessage.created_at,
          timestamp: new Date(),
        })

        // Send auto-reply if this is first customer message
        if (!isOwner) {
          const allMessages = await getConversationMessages(conversationId)
          if (allMessages.length === 1) {
            // This is the first message
            setTimeout(() => {
              const autoReplyMessage = `Thanks for contacting us! 🙏\n\nWe appreciate your message. Our owner will get back to you shortly.\n\n📱 WhatsApp: +880 1234 567890\n\nWe're here to help!`

              chatNamespace.to(`conversation:${conversationId}`).emit('new-message', {
                id: 'auto-reply-' + Date.now(),
                conversationId,
                senderId: 'owner',
                senderName: 'BedTex Owner',
                message: autoReplyMessage,
                isOwner: true,
                isAutoReply: true,
                createdAt: new Date(),
                timestamp: new Date(),
              })
            }, 500)
          }
        }
      } catch (error) {
        logger.error('Error in send-message:', error, { socketId: socket.id })
        socket.emit('error', { message: 'Error sending message' })
      }
    })

    /**
     * Mark messages as read
     */
    socket.on('mark-read', async (data) => {
      try {
        const { conversationId, userId } = data

        await markMessagesAsRead(conversationId, userId)

        // Notify others that messages are read
        chatNamespace
          .to(`conversation:${conversationId}`)
          .emit('messages-read', { conversationId, userId })

        logger.info('✅ Messages marked as read', { conversationId, userId })
      } catch (error) {
        logger.error('Error marking messages as read:', error)
      }
    })

    /**
     * User typing
     */
    socket.on('typing', (data) => {
      const { conversationId, userId, isTyping } = data

      chatNamespace
        .to(`conversation:${conversationId}`)
        .emit('user-typing', { userId, isTyping, timestamp: new Date() })
    })

    /**
     * User disconnection
     */
    socket.on('disconnect', () => {
      const userInfo = activeChatUsers.get(socket.id)

      if (userInfo) {
        activeChatUsers.delete(socket.id)
        logger.info('👋 User disconnected from chat', {
          socketId: socket.id,
          userId: userInfo.userId,
        })

        // Notify others that user went offline
        chatNamespace
          .to(`conversation:${userInfo.conversationId}`)
          .emit('user-offline', { userId: userInfo.userId, timestamp: new Date() })
      }
    })

    /**
     * Error handler
     */
    socket.on('error', (error) => {
      logger.error('Socket error:', error, { socketId: socket.id })
    })
  })

  logger.info('✅ Chat Socket.io namespace initialized', {
    namespace: '/chat',
    maxConnections: 'unlimited',
  })

  return chatNamespace
}

/**
 * Broadcast new chat notification to owner (admin)
 */
export function notifyOwnerNewChat(io, conversationId, userInfo) {
  io.to('admin').emit('new-chat-conversation', {
    conversationId,
    userInfo,
    timestamp: new Date(),
  })
}

export default {
  initializeChatSocket,
  notifyOwnerNewChat,
}
