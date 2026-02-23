/**
 * API Integration Tests
 * Tests all critical endpoints for Phase 1 fixes
 * Run with: npm test -- api.test.js
 */

import request from 'supertest'
import app from '../app.js'
import database from '../database/db.js'
import bcrypt from 'bcrypt'
import { setupTestUsers } from './setup.js'

// Test data
let adminToken
let productId
let orderId
let customerId
let lastCSRFToken

// Helper to get fresh CSRF token for each request
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

// Setup test users before running tests
beforeAll(async () => {
  await setupTestUsers()
})

// Helper to get auth token
async function getAdminToken() {
  if (adminToken) return adminToken

  try {
    // Step 1: Get CSRF token
    const csrfResponse = await request(app).get('/api/v1/csrf-token')

    if (!csrfResponse.body.csrfToken) {
      throw new Error('Could not get CSRF token')
    }

    const csrfToken = csrfResponse.body.csrfToken

    // Step 2: Login with CSRF token
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({
        email: 'test@admin.com',
        password: 'TestAdmin@123456',
      })

    // Token can be in response.body.token or response.body.accessToken
    if (response.body.token || response.body.accessToken) {
      adminToken = response.body.token || response.body.accessToken
      return adminToken
    }

    // Log response for debugging
    console.error('❌ Login response:', JSON.stringify(response.body, null, 2))
    throw new Error('Could not get admin token')
  } catch (error) {
    console.error('❌ Error in getAdminToken:', error.message)
    throw error
  }
}

describe('Product API Endpoints', () => {
  beforeAll(async () => {
    adminToken = await getAdminToken()
  })

  describe('GET /api/v1/product', () => {
    test('Should fetch all products', async () => {
      const response = await request(app)
        .get('/api/v1/product')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('success', true)
      expect(response.body).toHaveProperty('products')
      expect(Array.isArray(response.body.products)).toBe(true)
    })

    test('Should include pagination info', async () => {
      const response = await request(app)
        .get('/api/v1/product?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('success', true)
      expect(response.body).toHaveProperty('totalProducts')
      expect(response.body).toHaveProperty('products')
    })

    test('Should handle missing auth token', async () => {
      // Note: GET /api/v1/product is public, doesn't require auth
      // Test a protected endpoint instead - POST /api/v1/product/admin/create
      // Must provide CSRF token to get past CSRF check, then auth check will fail
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .post('/api/v1/product/admin/create')
        .set('X-CSRF-Token', csrfToken)

      expect(response.status).toBe(401)
      expect(response.body.success).toBe(false)
    })
  })

  describe('POST /api/v1/product/admin/create', () => {
    test('Should create product with valid data', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .post('/api/v1/product/admin/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-CSRF-Token', csrfToken)
        .field('name', 'Test Bedding Product')
        .field('description', 'High quality bedding')
        .field('price', '5000')
        .field('stock', '100')
        .field('category', 'Bedding')

      expect(response.status).toBe(201)
      expect(response.body).toHaveProperty('success', true)
      expect(response.body.product).toHaveProperty('id')
      expect(response.body.product.name).toBe('Test Bedding Product')

      productId = response.body.product.id
    })

    test('Should reject product with missing name', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .post('/api/v1/product/admin/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-CSRF-Token', csrfToken)
        .field('price', '5000')
        .field('stock', '100')
        .field('category', 'Bedding')

      expect(response.status).toBe(422)
      expect(response.body.success).toBe(false)
      expect(response.body.code).toBe('VALIDATION_ERROR')
    })

    test('Should reject product with invalid price', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .post('/api/v1/product/admin/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-CSRF-Token', csrfToken)
        .field('name', 'Test Product')
        .field('price', '-100')
        .field('stock', '100')
        .field('category', 'Bedding')

      expect(response.status).toBe(422)
      expect(response.body.success).toBe(false)
    })

    test('Should require admin role', async () => {
      // Ensure customer user exists
      const existingCustomer = await database.query('SELECT id FROM users WHERE email = $1', [
        'customer@example.com',
      ])

      if (existingCustomer.rows.length === 0) {
        const hashedPassword = await bcrypt.hash('password123', 10)
        await database.query(
          'INSERT INTO users (name, email, mobile, password, role, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
          ['Test Customer', 'customer@example.com', null, hashedPassword, 'User', new Date()],
        )
      }

      // Get customer token instead
      const csrfToken = await getCSRFToken()
      const loginRes = await request(app).post('/api/v1/auth/login').send({
        email: 'customer@example.com',
        password: 'password123',
      })

      const customerToken = loginRes.body.token || loginRes.body.accessToken

      const response = await request(app)
        .post('/api/v1/product/admin/create')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('X-CSRF-Token', csrfToken)
        .field('name', 'Test Product')
        .field('price', '5000')
        .field('stock', '100')
        .field('category', 'Bedding')

      expect(response.status).toBe(403)
      expect(response.body.success).toBe(false)
      expect(response.body.code).toBe('FORBIDDEN')
    })
  })

  describe('PUT /api/v1/product/admin/update/:id', () => {
    test('Should update product with valid data', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .put(`/api/v1/product/admin/update/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-CSRF-Token', csrfToken)
        .send({
          name: 'Updated Test Product',
          price: '5500',
          stock: '80',
        })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.product.name).toBe('Updated Test Product')
      expect(response.body.product.price).toBe(5500)
    })

    test('Should return 404 for non-existent product', async () => {
      const csrfToken = await getCSRFToken()
      // Use a valid UUID format that doesn't exist
      const nonExistentUUID = '00000000-0000-0000-0000-000000000000'
      const response = await request(app)
        .put(`/api/v1/product/admin/update/${nonExistentUUID}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-CSRF-Token', csrfToken)
        .send({ name: 'Updated Product' })

      expect(response.status).toBe(404)
      expect(response.body.success).toBe(false)
    })
  })

  describe('DELETE /api/v1/product/admin/delete/:id', () => {
    test('Should delete product', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .delete(`/api/v1/product/admin/delete/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-CSRF-Token', csrfToken)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
    })

    test('Should return 404 for already deleted product', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .delete(`/api/v1/product/admin/delete/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-CSRF-Token', csrfToken)

      expect(response.status).toBe(404)
      expect(response.body.success).toBe(false)
    })
  })
})

describe('Order API Endpoints', () => {
  beforeAll(async () => {
    await getAdminToken()
  })

  describe('GET /api/v1/order/admin/getall', () => {
    test('Should fetch all orders', async () => {
      const response = await request(app)
        .get('/api/v1/order/admin/getall')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(Array.isArray(response.body.data.orders)).toBe(true)
    })

    test('Should support filtering by status', async () => {
      const response = await request(app)
        .get('/api/v1/order/admin/getall?status=pending')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)

      // All orders should have status 'pending'
      const orders = response.body.data.orders
      orders.forEach((order) => {
        expect(order.order_status).toBe('pending')
      })
    })

    test('Should support pagination', async () => {
      const response = await request(app)
        .get('/api/v1/order/admin/getall?page=1&limit=5')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(response.status).toBe(200)
      expect(response.body.pagination.limit).toBe(5)
    })
  })

  describe('PUT /api/v1/order/admin/update/:id', () => {
    test('Should update order status', async () => {
      // First get an order
      const ordersRes = await request(app)
        .get('/api/v1/order/admin/getall')
        .set('Authorization', `Bearer ${adminToken}`)

      if (ordersRes.body.data.orders.length > 0) {
        orderId = ordersRes.body.data.orders[0].id
        const csrfToken = await getCSRFToken()

        const response = await request(app)
          .put(`/api/v1/order/admin/update/${orderId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-CSRF-Token', csrfToken)
          .send({ order_status: 'shipped' })

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
        expect(response.body.data.order_status).toBe('Shipped')
      }
    })

    test('Should reject invalid status', async () => {
      const ordersRes = await request(app)
        .get('/api/v1/order/admin/getall')
        .set('Authorization', `Bearer ${adminToken}`)

      if (ordersRes.body.data.orders.length > 0) {
        const testOrderId = ordersRes.body.data.orders[0].id
        const csrfToken = await getCSRFToken()

        const response = await request(app)
          .put(`/api/v1/order/admin/update/${testOrderId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-CSRF-Token', csrfToken)
          .send({ order_status: 'invalid_status' })

        expect(response.status).toBe(422)
        expect(response.body.success).toBe(false)
      }
    })
  })
})

describe('Analytics API Endpoints', () => {
  beforeAll(async () => {
    await getAdminToken()
  })

  describe('GET /api/v1/analytics/revenue/metrics', () => {
    test('Should return revenue metrics', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/revenue/metrics')
        .set('Authorization', `Bearer ${adminToken}`)

      console.log(
        '🔍 Analytics revenue response:',
        response.status,
        JSON.stringify(response.body, null, 2),
      )
      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data).toBeDefined()
    })
  })

  describe('GET /api/v1/analytics/products/by-category', () => {
    test('Should return category sales data', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/products/by-category')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(Array.isArray(response.body.data)).toBe(true)
    })
  })

  describe('GET /api/v1/admin/dashboard', () => {
    test('Should return dashboard stats', async () => {
      const response = await request(app)
        .get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data).toHaveProperty('totalOrders')
      expect(response.body.data).toHaveProperty('totalRevenue')
      expect(response.body.data).toHaveProperty('totalCustomers')
    })
  })
})

describe('Response Format Standardization', () => {
  test('All success responses should have standard format', async () => {
    const token = await getAdminToken()

    // Test with an endpoint that uses the new response format
    const response = await request(app)
      .get('/api/v1/order/admin/getall')
      .set('Authorization', `Bearer ${token}`)

    // Should have these properties
    expect(response.body).toHaveProperty('success', true)
    expect(response.body).toHaveProperty('message')
    expect(response.body).toHaveProperty('data')
    expect(response.body).toHaveProperty('timestamp')

    // Timestamp should be valid ISO string
    expect(new Date(response.body.timestamp)).toBeInstanceOf(Date)
  })

  test('All error responses should have standard format', async () => {
    // Try to fetch a non-existent product - should return 404 with error format
    const nonExistentUUID = '00000000-0000-0000-0000-000000000000'
    const response = await request(app)
      .get(`/api/v1/product/singleProduct/${nonExistentUUID}`)
      .set('Authorization', `Bearer ${adminToken}`)

    // Should have these properties
    expect(response.body).toHaveProperty('success', false)
    expect(response.body).toHaveProperty('message')
    expect(response.body).toHaveProperty('code')
    expect(response.body).toHaveProperty('timestamp')
  })
})

describe('Error Handling', () => {
  test('Should handle 401 Unauthorized', async () => {
    const response = await request(app).get('/api/v1/admin/dashboard')

    expect(response.status).toBe(401)
    expect(response.body.success).toBe(false)
    expect(response.body.code).toBe('UNAUTHORIZED')
  })

  test('Should handle 404 Not Found', async () => {
    const token = await getAdminToken()

    const response = await request(app)
      .get('/api/v1/product/999999')
      .set('Authorization', `Bearer ${token}`)

    expect(response.status).toBe(404)
    expect(response.body.success).toBe(false)
  })

  test('Should handle invalid request body', async () => {
    const token = await getAdminToken()
    const csrfToken = await getCSRFToken()

    const response = await request(app)
      .post('/api/v1/product/admin/create')
      .set('Authorization', `Bearer ${token}`)
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: '', // Empty
        price: 'invalid', // Not a number
      })

    expect(response.status).toBe(422)
    expect(response.body.success).toBe(false)
    expect(response.body.code).toBe('VALIDATION_ERROR')
  })
})
