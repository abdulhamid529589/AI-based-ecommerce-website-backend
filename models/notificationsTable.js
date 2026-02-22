import database from '../database/db.js'

/**
 * Create Notifications Table
 * Stores user notifications for orders, promotions, system messages
 */
export const createNotificationsTable = async () => {
  try {
    const query = `
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT,
        data JSONB DEFAULT '{}',
        priority VARCHAR(20) DEFAULT 'normal',
        is_read BOOLEAN DEFAULT false,
        read_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `

    await database.query(query)
    console.log('✅ Notifications table created successfully')

    // Create indexes for better query performance
    const indexQueries = [
      `CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read);`,
    ]

    for (const indexQuery of indexQueries) {
      await database.query(indexQuery)
    }

    console.log('✅ Notification indexes created successfully')
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log('ℹ️ Notifications table already exists')
    } else {
      console.error('❌ Error creating notifications table:', error.message)
      throw error
    }
  }
}

export default createNotificationsTable
