/**
 * Test Setup - Create test users before running tests
 * This script runs before any tests and creates admin/user test accounts
 */

import database from '../database/db.js'
import bcrypt from 'bcrypt'

export async function setupTestUsers() {
  try {
    // Check if test admin user exists
    const existingUser = await database.query('SELECT id FROM users WHERE email = $1', [
      'test@admin.com',
    ])

    if (existingUser.rows.length > 0) {
      console.log('✅ Test user already exists')
    } else {
      // Create strong password that meets requirements
      const testPassword = 'TestAdmin@123456'
      const hashedPassword = await bcrypt.hash(testPassword, 10)

      // Insert test admin user
      await database.query(
        'INSERT INTO users (name, email, mobile, password, role, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        ['Test Admin', 'test@admin.com', null, hashedPassword, 'Admin', new Date()],
      )

      console.log('✅ Test admin user created with email: test@admin.com')
      console.log('   Password: TestAdmin@123456')
    }

    // Check if test customer user exists
    const existingCustomer = await database.query('SELECT id FROM users WHERE email = $1', [
      'customer@example.com',
    ])

    if (existingCustomer.rows.length === 0) {
      const customerPassword = 'password123'
      const hashedCustomerPassword = await bcrypt.hash(customerPassword, 10)

      // Insert test customer user with non-admin role
      await database.query(
        'INSERT INTO users (name, email, mobile, password, role, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        ['Test Customer', 'customer@example.com', null, hashedCustomerPassword, 'User', new Date()],
      )

      console.log('✅ Test customer user created with email: customer@example.com')
      console.log('   Password: password123')
    }
  } catch (error) {
    console.error('⚠️ Error setting up test users:', error.message)
    // Don't fail setup - tests might still work with existing users
  }
}

export async function cleanupTestUsers() {
  try {
    await database.query('DELETE FROM users WHERE email = $1 OR email = $2', [
      'test@admin.com',
      'customer@example.com',
    ])
    console.log('✅ Test users cleaned up')
  } catch (error) {
    console.error('⚠️ Error cleaning up test users:', error.message)
  }
}
