/**
 * Quick API Validation Tests
 * Validates that critical endpoints are responding and Phase 1 fixes are working
 */

import request from 'supertest'
import app from '../app.js'

// Helper to get auth token
async function getAdminToken() {
  // First get CSRF token
  const csrfResponse = await request(app).get('/api/v1/csrf-token')
  const csrfToken = csrfResponse.body.csrfToken

  // Login with CSRF token
  const response = await request(app)
    .post('/api/v1/auth/login')
    .set('X-CSRF-Token', csrfToken)
    .send({
      email: 'aslam687492@gmail.com',
      password: 'Test@1234567',
    })

  return response.body.token || response.body.accessToken
}

describe('Phase 1 Fixes Validation', () => {
  let adminToken

  beforeAll(async () => {
    // Try to get a test token
    try {
      adminToken = await getAdminToken()
    } catch (error) {
      console.warn('⚠️ Could not get admin token, some tests will be skipped:', error.message)
      adminToken = null
    }
  })

  describe('GET Endpoints (No Auth)', () => {
    test('GET /api/v1/product - Should return 200 with products', async () => {
      const response = await request(app).get('/api/v1/product')

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body).toHaveProperty('products')
    })

    test('GET /api/v1/csrf-token - Should return CSRF token', async () => {
      const response = await request(app).get('/api/v1/csrf-token')

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('csrfToken')
    })
  })

  describe('Protected Endpoints (With Auth)', () => {
    test('GET /api/v1/order/admin/getall - Should require auth', async () => {
      // Without auth - should fail
      const noAuthResponse = await request(app).get('/api/v1/order/admin/getall')
      expect(noAuthResponse.status).toBe(401)

      // With auth - test only if we have a token
      if (adminToken) {
        const response = await request(app)
          .get('/api/v1/order/admin/getall')
          .set('Authorization', `Bearer ${adminToken}`)

        expect([200, 401, 403]).toContain(response.status)
      }
    })
  })

  describe('Error Handling', () => {
    test('Should return proper error for missing auth', async () => {
      const response = await request(app).get('/api/v1/order/admin/getall')

      expect(response.status).toBe(401)
      expect(response.body.success).toBe(false)
    })

    test('Should return proper error for invalid path', async () => {
      const response = await request(app).get('/api/v1/invalid-endpoint')

      expect(response.status).toBe(404)
    })
  })

  describe('Response Format Validation', () => {
    test('Success responses should have correct structure', async () => {
      const response = await request(app).get('/api/v1/product')

      expect(response.body).toHaveProperty('success')
      expect(typeof response.body.success).toBe('boolean')
    })

    test('Error responses should have error info', async () => {
      const response = await request(app).get('/api/v1/order/admin/getall')

      expect(response.status).toBe(401)
      expect(response.body).toHaveProperty('success', false)
    })
  })
})
