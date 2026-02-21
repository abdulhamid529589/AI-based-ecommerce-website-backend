/**
 * Migration: Add mobile column to users table
 * Handles the case where users table exists but is missing the mobile column
 */

import database from './db.js'

export const addMobileColumnToUsers = async () => {
  try {
    // Check if mobile column already exists
    const checkQuery = `
      SELECT COUNT(*) as count FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'mobile'
    `

    const result = await database.query(checkQuery)
    const columnExists = parseInt(result.rows[0].count, 10) > 0

    if (!columnExists) {
      console.log('🔧 Adding mobile column to users table...')

      const alterQuery = `
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS mobile VARCHAR(20) UNIQUE NULL,
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'User'
      `

      await database.query(alterQuery)
      console.log('✅ Successfully added mobile column to users table')
    } else {
      console.log('✅ Mobile column already exists in users table')
    }
  } catch (error) {
    console.error('❌ Error adding mobile column:', error?.message || error)
    // Log but don't throw - DB may not be ready yet
    return false
  }

  return true
}

export default addMobileColumnToUsers
