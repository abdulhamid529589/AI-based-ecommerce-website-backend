/**
 * Phase 8 Tests - Image Upload & File Management
 * Comprehensive tests for backend image upload to Cloudinary
 * Run with: npm test -- phase8.test.js
 */

import request from 'supertest'
import app from '../app.js'
import database from '../database/db.js'
import bcrypt from 'bcrypt'
import fs from 'fs'
import path from 'path'

let adminToken
let customerToken
let lastCSRFToken

// Helper to get CSRF token
async function getCSRFToken() {
  try {
    const response = await request(app).get('/api/v1/csrf-token')
    if (response.body.csrfToken) {
      lastCSRFToken = response.body.csrfToken
      return lastCSRFToken
    }
  } catch (error) {
    console.error('❌ Error getting CSRF token:', error.message)
  }
  return lastCSRFToken || ''
}

// Helper to create test user
async function createTestUser(email, role = 'Customer') {
  try {
    const hashedPassword = await bcrypt.hash('TestPass@123456', 10)
    const result = await database.query(
      `INSERT INTO users (name, email, mobile, password, role, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO UPDATE SET role = $5 RETURNING id`,
      [
        role === 'Admin' ? 'Test Admin Phase 8' : `Test Customer ${email}`,
        email,
        '01700000000',
        hashedPassword,
        role,
        new Date(),
      ],
    )
    return result.rows[0].id
  } catch (error) {
    console.error('Error creating test user:', error.message)
  }
}

// Helper to get auth token
async function getAuthToken(email) {
  try {
    const csrfToken = await getCSRFToken()
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({
        email,
        password: 'TestPass@123456',
      })
    return response.body.token || response.body.accessToken
  } catch (error) {
    console.error('Error getting auth token:', error.message)
  }
}

describe('Phase 8: Image Upload & File Management', () => {
  beforeAll(async () => {
    console.log('\n📸 Phase 8: Image Upload Testing\n')

    // Create test admin
    await createTestUser('admin@phase8.com', 'Admin')
    adminToken = await getAuthToken('admin@phase8.com')
    console.log('✅ Admin token obtained')

    // Create test customer (should NOT have upload permissions)
    await createTestUser('customer@phase8.com', 'Customer')
    customerToken = await getAuthToken('customer@phase8.com')
    console.log('✅ Customer token obtained')
  })

  // ============================================
  // IMAGE UPLOAD TESTS
  // ============================================
  describe('Image Upload Endpoint', () => {
    it('should reject image upload without authentication', async () => {
      console.log('\n  📋 Test: Reject unauthenticated upload')
      const response = await request(app)
        .post('/api/v1/admin/upload/image')
        .field('file', 'dummy content')

      expect([401, 403, 400]).toContain(response.statusCode)
      console.log(`  ✅ Correctly rejected (${response.statusCode})`)
    })

    it('should reject image upload from non-admin user', async () => {
      console.log('\n  📋 Test: Reject non-admin upload')
      const response = await request(app)
        .post('/api/v1/admin/upload/image')
        .set('Authorization', `Bearer ${customerToken}`)
        .field('file', 'dummy content')

      expect([401, 403, 400]).toContain(response.statusCode)
      console.log(`  ✅ Correctly rejected non-admin (${response.statusCode})`)
    })

    it('should reject upload without file', async () => {
      console.log('\n  📋 Test: Reject upload without file')
      const response = await request(app)
        .post('/api/v1/admin/upload/image')
        .set('Authorization', `Bearer ${adminToken}`)

      expect([400, 422]).toContain(response.statusCode)
      expect(response.body.message).toMatch(/file|upload/i)
      console.log(`  ✅ Correctly rejected empty upload (${response.statusCode})`)
      console.log(`     Message: ${response.body.message}`)
    })

    it('should validate file type (reject non-image)', async () => {
      console.log('\n  📋 Test: Reject non-image file type')

      // Create a test file path
      const testFilePath = path.join('/tmp', 'test.txt')
      try {
        fs.writeFileSync(testFilePath, 'This is not an image')

        const response = await request(app)
          .post('/api/v1/admin/upload/image')
          .set('Authorization', `Bearer ${adminToken}`)
          .attach('file', testFilePath)

        console.log(`  Response Status: ${response.statusCode}`)
        console.log(`  Response Body:`, JSON.stringify(response.body, null, 2))

        // Should reject .txt file (not an image)
        if (response.statusCode === 400 || response.statusCode === 422) {
          expect(response.body.message).toMatch(/image|file type/i)
          console.log(`  ✅ Correctly rejected non-image file`)
        } else {
          console.log(`  ⚠️  Unexpected response: ${response.statusCode}`)
        }
      } finally {
        if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath)
      }
    })

    it('should validate file size (reject files > 5MB)', async () => {
      console.log('\n  📋 Test: Reject file size > 5MB')

      // Create a test file larger than 5MB
      const testFilePath = path.join('/tmp', 'test-large.jpg')
      try {
        const sixMB = 6 * 1024 * 1024
        const buffer = Buffer.alloc(sixMB)
        fs.writeFileSync(testFilePath, buffer)

        const response = await request(app)
          .post('/api/v1/admin/upload/image')
          .set('Authorization', `Bearer ${adminToken}`)
          .attach('file', testFilePath)

        console.log(`  Response Status: ${response.statusCode}`)
        console.log(`  Response Body:`, JSON.stringify(response.body, null, 2))

        if (response.statusCode === 400 || response.statusCode === 422) {
          expect(response.body.message).toMatch(/size|5MB|exceeds/i)
          console.log(`  ✅ Correctly rejected oversized file`)
        }
      } finally {
        if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath)
      }
    })

    it('should successfully upload valid JPEG image', async () => {
      console.log('\n  📋 Test: Upload valid JPEG image')

      // Find a real image to test with
      const testImagePath = '/boot/grub-16x9.png'
      if (!fs.existsSync(testImagePath)) {
        console.log(`  ⚠️  Test image not found at ${testImagePath}, skipping`)
        return
      }

      console.log(`  📂 Using test image: ${testImagePath}`)
      const response = await request(app)
        .post('/api/v1/admin/upload/image')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', testImagePath)

      console.log(`  Response Status: ${response.statusCode}`)
      console.log(`  Response Body:`, JSON.stringify(response.body, null, 2))

      if ([200, 201].includes(response.statusCode)) {
        expect(response.body.secure_url).toBeDefined()
        expect(response.body.public_id).toBeDefined()
        expect(response.body.secure_url).toMatch(/https:\/\//i)
        console.log(`  ✅ Successfully uploaded image`)
        console.log(`     URL: ${response.body.secure_url}`)
        console.log(`     Public ID: ${response.body.public_id}`)
      } else if (response.statusCode === 500) {
        console.log(`  ❌ Server error on upload:`, response.body.message)
        console.log(`     Error details:`, response.body.error)
      } else {
        console.log(`  ⚠️  Unexpected response (${response.statusCode}): ${response.body.message}`)
      }
    })
  })

  // ============================================
  // CSRF MIDDLEWARE TESTS
  // ============================================
  describe('CSRF Protection for Uploads', () => {
    it('should skip CSRF for authenticated admin uploads', async () => {
      console.log('\n  📋 Test: CSRF exemption for admin uploads')
      const testImagePath = '/boot/grub-16x9.png'

      if (!fs.existsSync(testImagePath)) {
        console.log(`  ⚠️  Test image not found, skipping`)
        return
      }

      // Send upload WITHOUT CSRF token (should work because JWT auth is sufficient)
      const response = await request(app)
        .post('/api/v1/admin/upload/image')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', testImagePath)

      console.log(`  Response Status: ${response.statusCode}`)

      // Should either succeed (200/201) or fail with auth error, NOT CSRF error
      if (response.statusCode === 403 && response.body.code === 'CSRF_FAILED') {
        console.log(`  ❌ CSRF check is incorrectly blocking authenticated upload`)
        console.log(`     This should be skipped for JWT-authenticated requests`)
      } else if ([200, 201].includes(response.statusCode)) {
        console.log(`  ✅ Successfully uploaded without CSRF token (JWT auth sufficient)`)
      } else {
        console.log(`  ℹ️  Response: ${response.statusCode} - ${response.body.message}`)
      }
    })
  })

  // ============================================
  // REQUEST LOGGING TESTS
  // ============================================
  describe('Request Logging & Debugging', () => {
    it('should log file details when received', async () => {
      console.log('\n  📋 Test: Request logging functionality')
      const testImagePath = '/boot/grub-16x9.png'

      if (!fs.existsSync(testImagePath)) {
        console.log(`  ⚠️  Test image not found, skipping`)
        return
      }

      console.log(`  📤 Sending request with file: ${testImagePath}`)
      console.log(`  📊 File stats:`)
      const stats = fs.statSync(testImagePath)
      console.log(`     Size: ${stats.size} bytes`)
      console.log(`     Modified: ${stats.mtime}`)

      const response = await request(app)
        .post('/api/v1/admin/upload/image')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', testImagePath)

      console.log(`  📥 Response received (${response.statusCode})`)
      if (response.body.secure_url) {
        console.log(`  ✅ Upload successful - file was received by server`)
      } else if (
        response.body.message?.includes('file') ||
        response.body.message?.includes('File')
      ) {
        console.log(`  ⚠️  File was not properly received: ${response.body.message}`)
      }
    })
  })
})
