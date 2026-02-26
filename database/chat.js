/**
 * Chat Database Schema & Operations
 * Handles conversations and messages between customers and owner
 */

import database from './db.js'

/**
 * Initialize chat tables
 */
export async function createChatTables() {
  try {
    // Conversations table
    await database.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        owner_id UUID REFERENCES users(id),
        subject VARCHAR(255),
        status VARCHAR(50) DEFAULT 'open',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        last_message_at TIMESTAMP,
        unread_count INT DEFAULT 0
      )
    `)

    // Create indexes for conversations
    await database.query(
      `CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)`,
    )
    await database.query(
      `CREATE INDEX IF NOT EXISTS idx_conversations_owner_id ON conversations(owner_id)`,
    )
    await database.query(
      `CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status)`,
    )

    // Messages table
    await database.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id UUID NOT NULL REFERENCES users(id),
        message TEXT NOT NULL,
        is_owner BOOLEAN DEFAULT false,
        is_read BOOLEAN DEFAULT false,
        read_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `)

    // Create indexes for messages
    await database.query(
      `CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id)`,
    )
    await database.query(`CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id)`)
    await database.query(
      `CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)`,
    )

    console.log('✅ Chat tables created successfully')
    return true
  } catch (error) {
    if (!error.message.includes('already exists')) {
      console.error('❌ Error creating chat tables:', error.message)
    }
    return true
  }
}

/**
 * Create or get conversation
 */
export async function getOrCreateConversation(userId, subject = 'Support') {
  try {
    // Check if conversation already exists
    const existing = await database.query(
      `SELECT id FROM conversations WHERE user_id = $1 AND status = 'open' LIMIT 1`,
      [userId],
    )

    if (existing.rows.length > 0) {
      return existing.rows[0].id
    }

    // Create new conversation
    const result = await database.query(
      `INSERT INTO conversations (user_id, subject) VALUES ($1, $2) RETURNING id`,
      [userId, subject],
    )

    return result.rows[0].id
  } catch (error) {
    console.error('Error in getOrCreateConversation:', error.message)
    throw error
  }
}

/**
 * Save message to database
 */
export async function saveMessage(conversationId, senderId, message, isOwner = false) {
  try {
    const result = await database.query(
      `INSERT INTO messages (conversation_id, sender_id, message, is_owner)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [conversationId, senderId, message, isOwner],
    )

    // Update conversation's last_message_at
    await database.query(
      `UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [conversationId],
    )

    return result.rows[0]
  } catch (error) {
    console.error('Error saving message:', error.message)
    throw error
  }
}

/**
 * Get conversation messages
 */
export async function getConversationMessages(conversationId, limit = 50) {
  try {
    const result = await database.query(
      `SELECT m.*, u.name as sender_name, u.avatar
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2`,
      [conversationId, limit],
    )

    return result.rows.reverse() // Oldest first
  } catch (error) {
    console.error('Error getting messages:', error.message)
    throw error
  }
}

/**
 * Get user conversations
 */
export async function getUserConversations(userId) {
  try {
    const result = await database.query(
      `SELECT c.*, u.name as user_name, u.email as user_email, u.avatar as user_avatar
       FROM conversations c
       JOIN users u ON c.user_id = u.id
       WHERE c.user_id = $1
       ORDER BY c.last_message_at DESC NULLS LAST`,
      [userId],
    )

    return result.rows
  } catch (error) {
    console.error('Error getting user conversations:', error.message)
    throw error
  }
}

/**
 * Get owner conversations
 */
export async function getOwnerConversations(ownerId) {
  try {
    const result = await database.query(
      `SELECT c.*, u.name as user_name, u.email as user_email, u.avatar as user_avatar,
              (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND is_read = false AND is_owner = false) as unread_count
       FROM conversations c
       JOIN users u ON c.user_id = u.id
       WHERE c.status = 'open'
       ORDER BY c.last_message_at DESC NULLS LAST`,
      [ownerId],
    )

    return result.rows
  } catch (error) {
    console.error('Error getting owner conversations:', error.message)
    throw error
  }
}

/**
 * Mark messages as read
 */
export async function markMessagesAsRead(conversationId, userId) {
  try {
    await database.query(
      `UPDATE messages
       SET is_read = true, read_at = NOW()
       WHERE conversation_id = $1 AND sender_id != $2 AND is_read = false`,
      [conversationId, userId],
    )

    return true
  } catch (error) {
    console.error('Error marking messages as read:', error.message)
    throw error
  }
}

/**
 * Close conversation
 */
export async function closeConversation(conversationId) {
  try {
    await database.query(`UPDATE conversations SET status = 'closed' WHERE id = $1`, [
      conversationId,
    ])

    return true
  } catch (error) {
    console.error('Error closing conversation:', error.message)
    throw error
  }
}

export default {
  createChatTables,
  getOrCreateConversation,
  saveMessage,
  getConversationMessages,
  getUserConversations,
  getOwnerConversations,
  markMessagesAsRead,
  closeConversation,
}
