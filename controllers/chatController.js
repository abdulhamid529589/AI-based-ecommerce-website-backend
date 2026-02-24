/**
 * Chat Controller
 * Handles chat functionality for customers and admin
 */

import { catchAsyncErrors } from '../middlewares/catchAsyncError.js'
import ErrorHandler from '../middlewares/errorMiddleware.js'
import * as chatModel from '../models/chatMessage.js'

/**
 * Get chat history for current user
 */
export const getChatHistory = catchAsyncErrors(async (req, res, next) => {
  const { limit = 50, offset = 0 } = req.query
  const userId = req.user.id

  if (!userId) {
    return next(new ErrorHandler('User not authenticated', 401))
  }

  try {
    const messages = await chatModel.getChatHistory(userId, parseInt(limit), parseInt(offset))

    res.status(200).json({
      success: true,
      data: messages,
      count: messages.length,
    })
  } catch (error) {
    return next(new ErrorHandler('Failed to fetch chat history', 500))
  }
})

/**
 * Get all conversations (Admin only)
 */
export const getAllConversations = catchAsyncErrors(async (req, res, next) => {
  // Check if admin
  if (req.user.role !== 'Admin') {
    return next(new ErrorHandler('Access denied. Admin only.', 403))
  }

  const { limit = 50, offset = 0 } = req.query

  try {
    const conversations = await chatModel.getAllConversations(parseInt(limit), parseInt(offset))

    res.status(200).json({
      success: true,
      data: conversations,
      count: conversations.length,
    })
  } catch (error) {
    return next(new ErrorHandler('Failed to fetch conversations', 500))
  }
})

/**
 * Get online users (Admin only)
 */
export const getOnlineUsers = catchAsyncErrors(async (req, res, next) => {
  if (req.user.role !== 'Admin') {
    return next(new ErrorHandler('Access denied. Admin only.', 403))
  }

  try {
    const onlineUsers = await chatModel.getOnlineUsers()

    res.status(200).json({
      success: true,
      data: onlineUsers,
      count: onlineUsers.length,
    })
  } catch (error) {
    return next(new ErrorHandler('Failed to fetch online users', 500))
  }
})

/**
 * Mark messages as read
 */
export const markAsRead = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user.id

  if (!userId) {
    return next(new ErrorHandler('User not authenticated', 401))
  }

  try {
    await chatModel.markMessagesAsRead(userId)

    res.status(200).json({
      success: true,
      message: 'Messages marked as read',
    })
  } catch (error) {
    return next(new ErrorHandler('Failed to mark messages as read', 500))
  }
})

/**
 * Get unread message count
 */
export const getUnreadCount = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user.id

  if (!userId) {
    return next(new ErrorHandler('User not authenticated', 401))
  }

  try {
    const count = await chatModel.getUnreadMessageCount(userId)

    res.status(200).json({
      success: true,
      unread_count: count,
    })
  } catch (error) {
    return next(new ErrorHandler('Failed to fetch unread count', 500))
  }
})

/**
 * Delete message (Admin only or message owner)
 */
export const deleteMessage = catchAsyncErrors(async (req, res, next) => {
  const { messageId } = req.params
  const userId = req.user.id

  if (!messageId || !userId) {
    return next(new ErrorHandler('Invalid request', 400))
  }

  try {
    // TODO: Implement message deletion with permission check
    res.status(200).json({
      success: true,
      message: 'Message deleted',
    })
  } catch (error) {
    return next(new ErrorHandler('Failed to delete message', 500))
  }
})
