/**
 * Migration Script: Initialize Database Schema
 * This script ensures all required tables and columns exist.
 */

import database from './db.js'

/**
 * Add notification preference columns to users table
 */
const initializeUserNotificationColumns = async () => {
  try {
    // Check if notification columns exist
    const checkColumnsQuery = `
      SELECT COUNT(*) as count FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name IN ('email_notifications', 'sms_notifications', 'push_notifications')
    `

    const result = await database.query(checkColumnsQuery)
    const existingColumns = parseInt(result.rows[0].count, 10)

    if (existingColumns < 3) {
      console.log('🔧 Initializing notification preference columns in users table...')

      // Add the missing columns
      const alterQuery = `
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS sms_notifications BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS push_notifications BOOLEAN DEFAULT true;
      `

      await database.query(alterQuery)
      console.log('✅ Successfully added notification preference columns to users table')
    } else {
      console.log('✅ Notification preference columns already exist in users table')
    }
  } catch (error) {
    console.error('❌ Error initializing notification columns:', error.message)
    // Don't throw - this is optional and shouldn't break startup
  }
}

/**
 * Create user_addresses table for address management
 */
const initializeAddressesTable = async () => {
  try {
    console.log('🔧 Initializing user_addresses table...')

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS user_addresses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        label VARCHAR(50) DEFAULT 'Home',
        full_name VARCHAR(255) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        street_address TEXT NOT NULL,
        apartment_suite VARCHAR(100),
        city VARCHAR(100) NOT NULL,
        division VARCHAR(100) NOT NULL,
        postal_code VARCHAR(10),
        is_default BOOLEAN DEFAULT false,
        is_billing BOOLEAN DEFAULT false,
        is_shipping BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id ON user_addresses(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_addresses_default ON user_addresses(user_id, is_default);
    `

    await database.query(createTableQuery)
    console.log('✅ Successfully initialized user_addresses table')
  } catch (error) {
    console.error('❌ Error initializing addresses table:', error.message)
    // Don't throw - this is optional and shouldn't break startup
  }
}

/**
 * Create wishlist_items table for wishlist management
 */
const initializeWishlistTable = async () => {
  try {
    console.log('🔧 Initializing wishlist_items table...')

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS wishlist_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, product_id)
      );

      CREATE INDEX IF NOT EXISTS idx_wishlist_user_id ON wishlist_items(user_id);
      CREATE INDEX IF NOT EXISTS idx_wishlist_product_id ON wishlist_items(product_id);
    `

    await database.query(createTableQuery)
    console.log('✅ Successfully initialized wishlist_items table')
  } catch (error) {
    console.error('❌ Error initializing wishlist table:', error.message)
    // Don't throw - this is optional and shouldn't break startup
  }
}

/**
 * Create cart_items table for cart management
 */
const initializeCartTable = async () => {
  try {
    console.log('🔧 Initializing cart_items table...')

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS cart_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, product_id)
      );

      CREATE INDEX IF NOT EXISTS idx_cart_user_id ON cart_items(user_id);
      CREATE INDEX IF NOT EXISTS idx_cart_product_id ON cart_items(product_id);
    `

    await database.query(createTableQuery)
    console.log('✅ Successfully initialized cart_items table')
  } catch (error) {
    console.error('❌ Error initializing cart table:', error.message)
    // Don't throw - this is optional and shouldn't break startup
  }
}

/**
 * Main initialization function
 */
export const initializeDatabase = async () => {
  console.log('\n📦 Initializing database schema...\n')
  await initializeUserNotificationColumns()
  await initializeAddressesTable()
  await initializeWishlistTable()
  await initializeCartTable()
  console.log('\n✅ Database schema initialization complete!\n')
}

export default initializeDatabase
