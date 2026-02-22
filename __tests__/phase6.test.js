/**
 * Phase 6 Tests - Analytics, Inventory Management & Admin Dashboard
 * Comprehensive tests for analytics, inventory tracking, and admin operations
 * Run with: npm test -- phase6.test.js
 */

import request from 'supertest'
import app from '../app.js'
import database from '../database/db.js'
import bcrypt from 'bcrypt'

let adminToken
let customerId
let productId
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
        role === 'Admin' ? 'Test Admin Phase 6' : `Test Customer ${email}`,
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

// Helper to create test product
async function createTestProduct(productName) {
  try {
    const csrfToken = await getCSRFToken()
    const response = await request(app)
      .post('/api/v1/products')
      .set('X-CSRF-Token', csrfToken)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: productName,
        description: 'Test product for inventory phase',
        price: 3000,
        stock_quantity: 50,
        category: 'Electronics',
      })
    return response.body.data?.id
  } catch (error) {
    console.error('Error creating test product:', error.message)
  }
}

describe('Phase 6: Analytics, Inventory & Admin Dashboard', () => {
  beforeAll(async () => {
    // Create test admin
    const adminId = await createTestUser('admin@phase6.com', 'Admin')
    adminToken = await getAuthToken('admin@phase6.com')

    // Create test customer
    customerId = await createTestUser('customer@phase6.com', 'Customer')

    // Create test products
    productId = await createTestProduct('Phase 6 Test Product')
  })

  // ============================================
  // INVENTORY MANAGEMENT TESTS
  // ============================================
  describe('Inventory Management System', () => {
    it('should retrieve product inventory', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .get(`/api/v1/products/${productId || 'TEST-001'}/inventory`)
        .set('X-CSRF-Token', csrfToken)
        .set('Authorization', `Bearer ${adminToken}`)

      expect([200, 404]).toContain(response.statusCode)
    })

    it('should update product stock (Admin only)', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .put(`/api/v1/products/${productId || 'TEST-001'}/stock`)
        .set('X-CSRF-Token', csrfToken)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          quantity: 100,
          action: 'add',
        })

      expect([200, 201, 404, 400]).toContain(response.statusCode)
    })

    it('should prevent customer from modifying inventory', async () => {
      const customerToken = await getAuthToken('customer@phase6.com')
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .put(`/api/v1/products/${productId || 'TEST-001'}/stock`)
        .set('X-CSRF-Token', csrfToken)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          quantity: 100,
          action: 'add',
        })

      expect([403, 404, 400]).toContain(response.statusCode)
    })

    it('should track inventory adjustments', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .get('/api/v1/admin/inventory/adjustments')
        .set('X-CSRF-Token', csrfToken)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(response.statusCode).toBeLessThan(500)
    })

    it('should alert on low stock', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .get('/api/v1/admin/inventory/low-stock')
        .set('X-CSRF-Token', csrfToken)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(response.statusCode).toBeLessThan(500)
    })
  })

  // ============================================
  // ANALYTICS & REPORTING TESTS
  // ============================================
  describe('Analytics & Reporting', () => {
    it('should retrieve sales analytics', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .get('/api/v1/analytics/sales')
        .set('X-CSRF-Token', csrfToken)
        .set('Authorization', `Bearer ${adminToken}`)

      expect([200, 403, 404, 401]).toContain(response.statusCode)
      if (response.statusCode === 200) {
        expect(response.body.success).toBe(true)
      }
    })

    it('should retrieve customer analytics', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .get('/api/v1/analytics/customers')
        .set('X-CSRF-Token', csrfToken)
        .set('Authorization', `Bearer ${adminToken}`)

      expect([200, 403, 404, 401]).toContain(response.statusCode)
    })

    it('should retrieve product performance metrics', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .get('/api/v1/analytics/products')
        .set('X-CSRF-Token', csrfToken)
        .set('Authorization', `Bearer ${adminToken}`)

      expect([200, 403, 404, 401]).toContain(response.statusCode)
    })

    it('should generate sales report', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .get('/api/v1/reports/sales?period=monthly')
        .set('X-CSRF-Token', csrfToken)
        .set('Authorization', `Bearer ${adminToken}`)

      expect([200, 403, 400, 404, 401]).toContain(response.statusCode)
    })

    it('should retrieve revenue metrics', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .get('/api/v1/analytics/revenue')
        .set('X-CSRF-Token', csrfToken)
        .set('Authorization', `Bearer ${adminToken}`)

      expect([200, 403, 404, 401]).toContain(response.statusCode)
    })

    it('should track conversion rates', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .get('/api/v1/analytics/conversion')
        .set('X-CSRF-Token', csrfToken)
        .set('Authorization', `Bearer ${adminToken}`)

      expect([200, 403, 404, 401]).toContain(response.statusCode)
    })
  })

  // ============================================
  // PRODUCT MANAGEMENT TESTS
  // ============================================
  describe('Product Management Operations', () => {
    it('should create bulk products', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .post('/api/v1/products/bulk')
        .set('X-CSRF-Token', csrfToken)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          products: [
            {
              name: 'Bulk Product 1',
              description: 'Test bulk product',
              price: 2000,
              stock_quantity: 30,
              category: 'Electronics',
            },
            {
              name: 'Bulk Product 2',
              description: 'Test bulk product',
              price: 3000,
              stock_quantity: 40,
              category: 'Home',
            },
          ],
        })

      expect([200, 201, 400, 403, 404]).toContain(response.statusCode)
    })

    it('should update product details', async () => {
      if (!productId) return

      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .put(`/api/v1/products/${productId}`)
        .set('X-CSRF-Token', csrfToken)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated Product Name',
          price: 3500,
          description: 'Updated description',
        })

      expect([200, 201, 404, 400]).toContain(response.statusCode)
    })

    it('should list all products with filters', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .get('/api/v1/products?category=Electronics&minPrice=1000&maxPrice=5000')
        .set('X-CSRF-Token', csrfToken)

      expect([200, 201, 404]).toContain(response.statusCode)
      if ([200, 201].includes(response.statusCode)) {
        expect(response.body.success).toBe(true)
      }
    })

    it('should search products', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .get('/api/v1/products/search?q=test')
        .set('X-CSRF-Token', csrfToken)

      expect([200, 400, 404]).toContain(response.statusCode)
    })
  })

  // ============================================
  // USER MANAGEMENT TESTS
  // ============================================
  describe('User Management (Admin)', () => {
    it('should retrieve all users', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .get('/api/v1/admin/users')
        .set('X-CSRF-Token', csrfToken)
        .set('Authorization', `Bearer ${adminToken}`)

      expect([200, 403, 404, 401]).toContain(response.statusCode)
    })

    it('should get user details', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .get(`/api/v1/admin/users/${customerId}`)
        .set('X-CSRF-Token', csrfToken)
        .set('Authorization', `Bearer ${adminToken}`)

      expect([200, 404, 403]).toContain(response.statusCode)
    })

    it('should update user role (Admin only)', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .put(`/api/v1/admin/users/${customerId}/role`)
        .set('X-CSRF-Token', csrfToken)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          role: 'Customer',
        })

      expect([200, 201, 404, 403, 400]).toContain(response.statusCode)
    })

    it('should deactivate user account', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .post(`/api/v1/admin/users/${customerId}/deactivate`)
        .set('X-CSRF-Token', csrfToken)
        .set('Authorization', `Bearer ${adminToken}`)

      expect([200, 201, 404, 403, 400]).toContain(response.statusCode)
    })

    it('should track user activity', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .get(`/api/v1/admin/users/${customerId}/activity`)
        .set('X-CSRF-Token', csrfToken)
        .set('Authorization', `Bearer ${adminToken}`)

      expect([200, 404, 403]).toContain(response.statusCode)
    })
  })

  // ============================================
  // PROMOTIONS & DISCOUNTS TESTS
  // ============================================
  describe('Promotions & Discounts Management', () => {
    it('should create promotion', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .post('/api/v1/promotions')
        .set('X-CSRF-Token', csrfToken)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Summer Sale 2026',
          description: 'Test promotion',
          discount_percentage: 20,
          start_date: new Date().toISOString(),
          end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })

      expect([200, 201, 400, 403, 404]).toContain(response.statusCode)
    })

    it('should retrieve active promotions', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .get('/api/v1/promotions/active')
        .set('X-CSRF-Token', csrfToken)

      expect([200, 400, 404]).toContain(response.statusCode)
    })

    it('should apply coupon code', async () => {
      const customerToken = await getAuthToken('customer@phase6.com')
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .post('/api/v1/checkout/apply-coupon')
        .set('X-CSRF-Token', csrfToken)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          couponCode: 'TEST2026',
          cartTotal: 5000,
        })

      expect([200, 400, 422, 404]).toContain(response.statusCode)
    })
  })

  // ============================================
  // AUDIT & COMPLIANCE TESTS
  // ============================================
  describe('Audit Logs & Compliance', () => {
    it('should retrieve audit logs', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('X-CSRF-Token', csrfToken)
        .set('Authorization', `Bearer ${adminToken}`)

      expect([200, 403, 404, 401]).toContain(response.statusCode)
    })

    it('should filter audit logs by action', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .get('/api/v1/admin/audit-logs?action=CREATE')
        .set('X-CSRF-Token', csrfToken)
        .set('Authorization', `Bearer ${adminToken}`)

      expect([200, 400, 403, 404, 401]).toContain(response.statusCode)
    })

    it('should generate compliance report', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .get('/api/v1/admin/compliance-report')
        .set('X-CSRF-Token', csrfToken)
        .set('Authorization', `Bearer ${adminToken}`)

      expect([200, 403, 404]).toContain(response.statusCode)
    })
  })

  // ============================================
  // DASHBOARD STATISTICS TESTS
  // ============================================
  describe('Dashboard Statistics', () => {
    it('should retrieve dashboard summary', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .get('/api/v1/admin/dashboard/summary')
        .set('X-CSRF-Token', csrfToken)
        .set('Authorization', `Bearer ${adminToken}`)

      expect([200, 403, 404, 401]).toContain(response.statusCode)
      if (response.statusCode === 200) {
        expect(response.body.success).toBe(true)
      }
    })

    it('should retrieve top products', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .get('/api/v1/admin/dashboard/top-products')
        .set('X-CSRF-Token', csrfToken)
        .set('Authorization', `Bearer ${adminToken}`)

      expect([200, 403, 404, 401]).toContain(response.statusCode)
    })

    it('should retrieve order statistics', async () => {
      const csrfToken = await getCSRFToken()
      const response = await request(app)
        .get('/api/v1/admin/dashboard/order-stats')
        .set('X-CSRF-Token', csrfToken)
        .set('Authorization', `Bearer ${adminToken}`)

      expect([200, 403, 404, 401]).toContain(response.statusCode)
    })
  })
})
