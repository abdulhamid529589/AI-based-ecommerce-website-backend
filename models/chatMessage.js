/**
 * Chat Message Model
 * Stores all messages between customers and owner
 */

import database from '../database/db.js'

export const createChatMessageTable = async () => {
  try {
    await database.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        message_type VARCHAR(20) DEFAULT 'text', -- text, image, file
        attachment_url VARCHAR(500),
        is_read BOOLEAN DEFAULT false,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT check_message_not_empty CHECK (LENGTH(TRIM(message)) > 0)
      );

      CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_sent_at ON chat_messages(sent_at DESC);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_is_read ON chat_messages(is_read);

      -- Table to track online users
      CREATE TABLE IF NOT EXISTS chat_online_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        socket_id VARCHAR(100),
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_chat_online_users_user_id ON chat_online_users(user_id);
      CREATE INDEX IF NOT EXISTS idx_chat_online_users_is_active ON chat_online_users(is_active);
    `)
    console.log('✅ Chat tables created successfully')
    return { success: true }
  } catch (err) {
    console.error('❌ Error creating chat tables:', err.message)
    throw err
  }
}

// Get chat history between customer and owner
export const getChatHistory = async (userId, limit = 50, offset = 0) => {
  try {
    const result = await database.query(
      `
        SELECT
          m.id,
          m.user_id,
          m.message,
          m.message_type,
          m.attachment_url,
          m.is_read,
          m.sent_at,
          u.name as user_name,
          u.email as user_email
        FROM chat_messages m
        JOIN users u ON m.user_id = u.id
        WHERE m.user_id = $1
        ORDER BY m.sent_at DESC
        LIMIT $2 OFFSET $3
      `,
      [userId, limit, offset],
    )
    return result.rows
  } catch (err) {
    console.error('Error fetching chat history:', err.message)
    throw err
  }
}

// Save new message
export const saveMessage = async (messageData) => {
  try {
    const { user_id, message, message_type = 'text', attachment_url = null } = messageData

    const result = await database.query(
      `
        INSERT INTO chat_messages (user_id, message, message_type, attachment_url)
        VALUES ($1, $2, $3, $4)
        RETURNING id, user_id, message, message_type, attachment_url, is_read, sent_at
      `,
      [user_id, message, message_type, attachment_url],
    )
    return result.rows[0]
  } catch (err) {
    console.error('Error saving message:', err.message)
    throw err
  }
}

// Mark messages as read
export const markMessagesAsRead = async (userId) => {
  try {
    await database.query(
      `
        UPDATE chat_messages
        SET is_read = true
        WHERE user_id = $1 AND is_read = false
      `,
      [userId],
    )
  } catch (err) {
    console.error('Error marking messages as read:', err.message)
    throw err
  }
}

// Get unread message count
export const getUnreadMessageCount = async (userId) => {
  try {
    const result = await database.query(
      `
        SELECT COUNT(*) as unread_count
        FROM chat_messages
        WHERE user_id = $1 AND is_read = false
      `,
      [userId],
    )
    return result.rows[0].unread_count
  } catch (err) {
    console.error('Error getting unread count:', err.message)
    throw err
  }
}

// Get all conversations with message counts
export const getAllConversations = async (limit = 50, offset = 0) => {
  try {
    const result = await database.query(
      `
        SELECT
          u.id,
          u.name,
          u.email,
          u.avatar,
          COUNT(m.id) as total_messages,
          COUNT(CASE WHEN m.is_read = false THEN 1 END) as unread_count,
          MAX(m.sent_at) as last_message_time,
          (SELECT message FROM chat_messages WHERE user_id = u.id ORDER BY sent_at DESC LIMIT 1) as last_message
        FROM users u
        LEFT JOIN chat_messages m ON u.id = m.user_id
        WHERE u.role = 'customer'
        GROUP BY u.id, u.name, u.email, u.avatar
        ORDER BY MAX(m.sent_at) DESC NULLS LAST
        LIMIT $1 OFFSET $2
      `,
      [limit, offset],
    )
    return result.rows
  } catch (err) {
    console.error('Error getting conversations:', err.message)
    throw err
  }
}

// Track online users
export const markUserOnline = async (userId, socketId) => {
  try {
    await database.query(
      `
        INSERT INTO chat_online_users (user_id, socket_id, is_active)
        VALUES ($1, $2, true)
        ON CONFLICT (user_id) DO UPDATE
        SET socket_id = $2, is_active = true, updated_at = CURRENT_TIMESTAMP
      `,
      [userId, socketId],
    )
  } catch (err) {
    console.error('Error marking user online:', err.message)
    throw err
  }
}

// Mark user offline
export const markUserOffline = async (userId) => {
  try {
    await database.query(
      `
        UPDATE chat_online_users
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
      `,
      [userId],
    )
  } catch (err) {
    console.error('Error marking user offline:', err.message)
    throw err
  }
}

// Get online users
export const getOnlineUsers = async () => {
  try {
    const result = await database.query(
      `
        SELECT
          u.id,
          u.name,
          u.email,
          u.avatar,
          cou.is_active,
          cou.last_seen
        FROM chat_online_users cou
        JOIN users u ON cou.user_id = u.id
        WHERE cou.is_active = true
        ORDER BY cou.updated_at DESC
      `,
    )
    return result.rows
  } catch (err) {
    console.error('Error getting online users:', err.message)
    throw err
  }
}

// Delete old messages (optional cleanup)
export const deleteOldMessages = async (daysOld = 90) => {
  try {
    const result = await database.query(
      `
        DELETE FROM chat_messages
        WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '${daysOld} days'
        RETURNING id
      `,
    )
    return result.rowCount
  } catch (err) {
    console.error('Error deleting old messages:', err.message)
    throw err
  }
}
