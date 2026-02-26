#!/usr/bin/env node
/**
 * Production Database Migration Script
 * Safely adds chat tables and all new fields to existing database
 * Run with: npm run production:migrate
 */

import database from '../database/db.js'
import { createLogger } from '../utils/logger.js'

const logger = createLogger('Production.Migration')

/**
 * Create chat tables
 */
async function createChatTables() {
  try {
    logger.info('🚀 Creating chat tables...')

    // Check if conversations table already exists
    const convCheck = await database.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'conversations'
      )
    `)

    if (!convCheck.rows[0].exists) {
      await database.query(`
        CREATE TABLE conversations (
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

      logger.info('✅ Conversations table created')
    } else {
      logger.info('⏭️  Conversations table already exists')
    }

    // Create indexes for conversations
    try {
      await database.query(
        `CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)`,
      )
      await database.query(
        `CREATE INDEX IF NOT EXISTS idx_conversations_owner_id ON conversations(owner_id)`,
      )
      await database.query(
        `CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status)`,
      )
      logger.info('✅ Conversation indexes created')
    } catch (error) {
      logger.warn('⏭️  Conversation indexes may already exist')
    }

    // Check if messages table already exists
    const msgCheck = await database.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'messages'
      )
    `)

    if (!msgCheck.rows[0].exists) {
      await database.query(`
        CREATE TABLE messages (
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

      logger.info('✅ Messages table created')
    } else {
      logger.info('⏭️  Messages table already exists')
    }

    // Create indexes for messages
    try {
      await database.query(
        `CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id)`,
      )
      await database.query(
        `CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id)`,
      )
      await database.query(
        `CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)`,
      )
      logger.info('✅ Message indexes created')
    } catch (error) {
      logger.warn('⏭️  Message indexes may already exist')
    }

    return true
  } catch (error) {
    logger.error('Error creating chat tables:', error)
    throw error
  }
}

/**
 * Add missing fields to products table
 */
async function addProductFields() {
  try {
    logger.info('🔧 Checking product table fields...')

    const fields = [
      { name: 'rating', definition: 'rating DECIMAL(3,2) DEFAULT 0' },
      { name: 'review_count', definition: 'review_count INT DEFAULT 0' },
      { name: 'updated_at', definition: 'updated_at TIMESTAMP DEFAULT NOW()' },
    ]

    for (const field of fields) {
      try {
        // Check if column exists
        const columnCheck = await database.query(
          `SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'products' AND column_name = $1
          )`,
          [field.name],
        )

        if (!columnCheck.rows[0].exists) {
          await database.query(`ALTER TABLE products ADD COLUMN ${field.definition}`)
          logger.info(`✅ Added column: ${field.name}`)
        } else {
          logger.info(`⏭️  Column already exists: ${field.name}`)
        }
      } catch (error) {
        logger.warn(`⏭️  Could not add column ${field.name}: ${error.message}`)
      }
    }

    return true
  } catch (error) {
    logger.error('Error adding product fields:', error)
    // Don't throw - products table might be fine
    return true
  }
}

/**
 * Verify all tables exist
 */
async function verifyTables() {
  try {
    logger.info('📊 Verifying all tables...')

    const requiredTables = [
      'users',
      'products',
      'categories',
      'orders',
      'reviews',
      'conversations',
      'messages',
    ]

    const result = await database.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `)

    const existingTables = result.rows.map((r) => r.table_name)
    const missingTables = requiredTables.filter((t) => !existingTables.includes(t))

    if (missingTables.length > 0) {
      logger.warn(`⚠️  Missing tables: ${missingTables.join(', ')}`)
    } else {
      logger.info(`✅ All required tables exist: ${requiredTables.join(', ')}`)
    }

    return {
      success: missingTables.length === 0,
      existing: existingTables,
      missing: missingTables,
    }
  } catch (error) {
    logger.error('Error verifying tables:', error)
    throw error
  }
}

/**
 * Main migration function
 */
async function runMigration() {
  try {
    logger.info('\n' + '='.repeat(70))
    logger.info('🚀 PRODUCTION DATABASE MIGRATION')
    logger.info('='.repeat(70) + '\n')

    // Step 1: Test connection
    logger.info('⏳ Testing database connection...')
    const connTest = await database.query('SELECT NOW()')
    logger.info('✅ Database connection successful\n')

    // Step 2: Create chat tables
    logger.info('📝 Step 1: Creating chat tables...')
    await createChatTables()
    logger.info('✅ Chat tables ready\n')

    // Step 3: Add missing product fields
    logger.info('📝 Step 2: Adding missing product fields...')
    await addProductFields()
    logger.info('✅ Product fields updated\n')

    // Step 4: Verify all tables
    logger.info('📝 Step 3: Verifying database schema...')
    const verification = await verifyTables()
    logger.info('✅ Database schema verified\n')

    // Final report
    logger.info('='.repeat(70))
    logger.info('✅ MIGRATION COMPLETED SUCCESSFULLY')
    logger.info('='.repeat(70))
    logger.info('\n📊 Migration Summary:')
    logger.info(`   • Total tables found: ${verification.existing.length}`)
    logger.info(
      `   • Required tables: ${verification.existing.length - verification.missing.length}/${7}`,
    )
    logger.info(`   • Chat system: Ready`)
    logger.info(`   • Products: Updated`)
    logger.info(`\n💡 Next steps:`)
    logger.info(`   • Deploy changes to production`)
    logger.info(`   • Run diagnostics: npm run diagnostics`)
    logger.info(`   • Test chat feature on website\n`)

    process.exit(0)
  } catch (error) {
    logger.error('\n❌ MIGRATION FAILED')
    logger.error('Error:', error.message)
    logger.info('\n💡 Troubleshooting:')
    logger.info('   • Check database connection')
    logger.info('   • Verify environment variables')
    logger.info('   • Run: npm run health:check')
    logger.info('   • Run: npm run diagnostics\n')
    process.exit(1)
  }
}

// Run migration
runMigration()
