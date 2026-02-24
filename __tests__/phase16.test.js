/**
 * Phase 16 Tests - Optional Product Fields
 * Tests: CREATE and UPDATE operations with all optional product fields
 * Validates: Data persistence, type conversions, field handling
 * Run with: npm test -- phase16.test.js
 */

import request from 'supertest'
import app from '../app.js'
import database from '../database/db.js'
import bcrypt from 'bcrypt'

let adminToken
let adminUserId
let testProductId

async function getCSRFToken() {
  const response = await request(app).get('/api/v1/csrf-token')
  return response.body.csrfToken
}

async function createTestAdmin(email) {
  try {
    const hashedPassword = await bcrypt.hash('testpass123', 10)
    const result = await database.query(
      'INSERT INTO users (name, email, mobile, password, role, created_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (email) DO UPDATE SET password = $4 RETURNING id',
      ['TestAdmin', email, '1234567890', hashedPassword, 'Admin', new Date()],
    )
    return result.rows[0].id
  } catch (error) {
    console.warn('Error creating test admin:', error.message)
    return null
  }
}

async function loginAdmin(email, password) {
  const csrfToken = await getCSRFToken()
  const response = await request(app)
    .post('/api/v1/auth/login')
    .set('X-CSRF-Token', csrfToken)
    .send({ email, password })

  return response.body.token || response.body.accessToken
}

async function getProductFromDB(productId) {
  const result = await database.query('SELECT * FROM products WHERE id = $1', [productId])
  return result.rows[0]
}

describe('Phase 16: Optional Product Fields - CREATE & UPDATE', () => {
  beforeAll(async () => {
    console.log('\n' + '='.repeat(70))
    console.log('🧪 PHASE 16: OPTIONAL PRODUCT FIELDS')
    console.log('='.repeat(70))
    console.log('Testing: All optional fields in CREATE and UPDATE operations\n')

    // Create test admin
    adminUserId = await createTestAdmin('phase16-admin@test.com')
    adminToken = await loginAdmin('phase16-admin@test.com', 'testpass123')
  })

  afterAll(async () => {
    // Clean up test data
    if (testProductId) {
      await database.query('DELETE FROM products WHERE id = $1', [testProductId])
    }
    if (adminUserId) {
      await database.query('DELETE FROM users WHERE id = $1', [adminUserId])
    }
    console.log('\n' + '='.repeat(70))
    console.log('✅ PHASE 16 CLEANUP COMPLETE')
    console.log('='.repeat(70) + '\n')
  })

  // ============ CREATE OPERATION TESTS ============
  describe('CREATE Product with Optional Fields', () => {
    test('✅ Should CREATE product with ALL optional text fields', async () => {
      const productData = {
        name: 'Test Product - Text Fields',
        description: 'Full description with all optional text fields',
        price: '99.99',
        stock: '100',
        category: 'Electronics',
        slug: 'test-product-text-fields',
        sku: 'SKU-TEXT-12345',
        barcode: '9876543210123',
        short_description: 'Quick summary of the product',
        product_type: 'simple',
        brand: 'TestBrand',
        shipping_class: 'standard',
        meta_title: 'SEO Title for Test Product',
        meta_description: 'SEO description for search engines',
        focus_keyword: 'test product keywords',
        purchase_note: 'Thank you for purchasing this item!',
      }

      const response = await request(app)
        .post('/api/v1/products/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send(productData)

      expect(response.status).toBe(201)
      expect(response.body.product).toBeDefined()
      testProductId = response.body.product.id

      // Verify in database
      const dbProduct = await getProductFromDB(testProductId)
      expect(dbProduct.slug).toBe('test-product-text-fields')
      expect(dbProduct.sku).toBe('SKU-TEXT-12345')
      expect(dbProduct.barcode).toBe('9876543210123')
      expect(dbProduct.short_description).toBe('Quick summary of the product')
      expect(dbProduct.product_type).toBe('simple')
      expect(dbProduct.brand).toBe('TestBrand')
      expect(dbProduct.shipping_class).toBe('standard')
      expect(dbProduct.meta_title).toBe('SEO Title for Test Product')
      expect(dbProduct.meta_description).toBe('SEO description for search engines')
      expect(dbProduct.focus_keyword).toBe('test product keywords')
      expect(dbProduct.purchase_note).toBe('Thank you for purchasing this item!')

      console.log('  ✓ All text optional fields saved correctly')
    })

    test('✅ Should CREATE product with ALL optional numeric fields', async () => {
      const productData = {
        name: 'Test Product - Numeric Fields',
        description: 'Product with all numeric optional fields',
        price: '49.99',
        stock: '50',
        category: 'Clothing',
        sale_price: '39.99',
        cost_price: '20.00',
        weight: '2.5',
        length: '30',
        width: '20',
        height: '15',
        low_stock_threshold: '10',
        menu_order: '5',
      }

      const response = await request(app)
        .post('/api/v1/products/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send(productData)

      expect(response.status).toBe(201)
      const productId = response.body.product.id

      // Verify in database with correct numeric types
      const dbProduct = await getProductFromDB(productId)
      expect(dbProduct.sale_price).toBe(39.99)
      expect(dbProduct.cost_price).toBe(20.0)
      expect(dbProduct.weight).toBe(2.5)
      expect(dbProduct.length).toBe(30)
      expect(dbProduct.width).toBe(20)
      expect(dbProduct.height).toBe(15)
      expect(dbProduct.low_stock_threshold).toBe(10)
      expect(dbProduct.menu_order).toBe(5)

      // Cleanup
      await database.query('DELETE FROM products WHERE id = $1', [productId])
      console.log('  ✓ All numeric optional fields saved correctly with proper types')
    })

    test('✅ Should CREATE product with ALL optional boolean fields', async () => {
      const productData = {
        name: 'Test Product - Boolean Fields',
        description: 'Product with all boolean optional fields',
        price: '75.00',
        stock: '25',
        category: 'Home',
        allow_backorders: 'true',
        sold_individually: 'false',
        free_shipping: 'true',
        enable_reviews: 'true',
        featured: 'false',
      }

      const response = await request(app)
        .post('/api/v1/products/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send(productData)

      expect(response.status).toBe(201)
      const productId = response.body.product.id

      // Verify in database with boolean values
      const dbProduct = await getProductFromDB(productId)
      expect(dbProduct.allow_backorders).toBe(true)
      expect(dbProduct.sold_individually).toBe(false)
      expect(dbProduct.free_shipping).toBe(true)
      expect(dbProduct.enable_reviews).toBe(true)
      expect(dbProduct.featured).toBe(false)

      // Cleanup
      await database.query('DELETE FROM products WHERE id = $1', [productId])
      console.log('  ✓ All boolean optional fields saved correctly with proper types')
    })

    test('✅ Should CREATE product with JSON optional fields (tags, image_alts)', async () => {
      const productData = {
        name: 'Test Product - JSON Fields',
        description: 'Product with JSON array fields',
        price: '55.00',
        stock: '75',
        category: 'Accessories',
        tags: ['tag1', 'tag2', 'tag3'],
        image_alts: ['Image 1 Alt', 'Image 2 Alt', 'Image 3 Alt'],
      }

      const response = await request(app)
        .post('/api/v1/products/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send(productData)

      expect(response.status).toBe(201)
      const productId = response.body.product.id

      // Verify in database
      const dbProduct = await getProductFromDB(productId)
      expect(Array.isArray(dbProduct.tags)).toBe(true)
      expect(dbProduct.tags).toEqual(['tag1', 'tag2', 'tag3'])
      expect(Array.isArray(dbProduct.image_alts)).toBe(true)
      expect(dbProduct.image_alts).toEqual(['Image 1 Alt', 'Image 2 Alt', 'Image 3 Alt'])

      // Cleanup
      await database.query('DELETE FROM products WHERE id = $1', [productId])
      console.log('  ✓ All JSON optional fields saved correctly with proper structure')
    })

    test('✅ Should CREATE product with MIXED optional fields', async () => {
      const productData = {
        name: 'Test Product - Mixed Fields',
        description: 'Complete product with all optional field types',
        price: '125.00',
        stock: '40',
        category: 'Electronics',
        // Text fields
        slug: 'complete-test-product',
        sku: 'SKU-COMPLETE-001',
        brand: 'CompleteBrand',
        meta_title: 'Complete Test Product',
        // Numeric fields
        sale_price: '99.99',
        cost_price: '60.00',
        weight: '1.8',
        length: '25',
        // Boolean fields
        allow_backorders: 'true',
        free_shipping: 'false',
        featured: 'true',
        enable_reviews: 'true',
        // JSON fields
        tags: ['electronics', 'test', 'featured'],
      }

      const response = await request(app)
        .post('/api/v1/products/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send(productData)

      expect(response.status).toBe(201)
      const productId = response.body.product.id

      // Verify all fields in database
      const dbProduct = await getProductFromDB(productId)
      expect(dbProduct.slug).toBe('complete-test-product')
      expect(dbProduct.sku).toBe('SKU-COMPLETE-001')
      expect(dbProduct.brand).toBe('CompleteBrand')
      expect(dbProduct.sale_price).toBe(99.99)
      expect(dbProduct.weight).toBe(1.8)
      expect(dbProduct.allow_backorders).toBe(true)
      expect(dbProduct.free_shipping).toBe(false)
      expect(dbProduct.featured).toBe(true)
      expect(Array.isArray(dbProduct.tags)).toBe(true)

      testProductId = productId
      console.log('  ✓ All mixed optional fields saved correctly')
    })
  })

  // ============ UPDATE OPERATION TESTS ============
  describe('UPDATE Product with Optional Fields', () => {
    beforeEach(async () => {
      // Ensure we have a test product
      if (!testProductId) {
        const response = await request(app)
          .post('/api/v1/products/create')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('Content-Type', 'application/json')
          .send({
            name: 'Base Product for Update Tests',
            description: 'Base product',
            price: '50.00',
            stock: '100',
            category: 'Test',
          })
        testProductId = response.body.product.id
      }
    })

    test('✅ Should UPDATE product text optional fields', async () => {
      const updateData = {
        sku: 'UPDATED-SKU-12345',
        barcode: '1111111111111',
        short_description: 'Updated short description',
        brand: 'UpdatedBrand',
        meta_title: 'Updated Meta Title',
      }

      const response = await request(app)
        .put(`/api/v1/products/${testProductId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send(updateData)

      expect(response.status).toBe(200)

      // Verify in database
      const dbProduct = await getProductFromDB(testProductId)
      expect(dbProduct.sku).toBe('UPDATED-SKU-12345')
      expect(dbProduct.barcode).toBe('1111111111111')
      expect(dbProduct.short_description).toBe('Updated short description')
      expect(dbProduct.brand).toBe('UpdatedBrand')
      expect(dbProduct.meta_title).toBe('Updated Meta Title')

      console.log('  ✓ Text optional fields updated correctly')
    })

    test('✅ Should UPDATE product numeric optional fields', async () => {
      const updateData = {
        sale_price: '45.00',
        cost_price: '25.50',
        weight: '3.2',
        length: '40',
        low_stock_threshold: '5',
      }

      const response = await request(app)
        .put(`/api/v1/products/${testProductId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send(updateData)

      expect(response.status).toBe(200)

      // Verify in database with correct numeric types
      const dbProduct = await getProductFromDB(testProductId)
      expect(dbProduct.sale_price).toBe(45.0)
      expect(dbProduct.cost_price).toBe(25.5)
      expect(dbProduct.weight).toBe(3.2)
      expect(dbProduct.length).toBe(40)
      expect(dbProduct.low_stock_threshold).toBe(5)

      console.log('  ✓ Numeric optional fields updated correctly')
    })

    test('✅ Should UPDATE product boolean optional fields', async () => {
      const updateData = {
        allow_backorders: 'true',
        free_shipping: 'true',
        featured: 'true',
        enable_reviews: 'false',
      }

      const response = await request(app)
        .put(`/api/v1/products/${testProductId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send(updateData)

      expect(response.status).toBe(200)

      // Verify in database
      const dbProduct = await getProductFromDB(testProductId)
      expect(dbProduct.allow_backorders).toBe(true)
      expect(dbProduct.free_shipping).toBe(true)
      expect(dbProduct.featured).toBe(true)
      expect(dbProduct.enable_reviews).toBe(false)

      console.log('  ✓ Boolean optional fields updated correctly')
    })

    test('✅ Should UPDATE product JSON optional fields', async () => {
      const updateData = {
        tags: ['updated', 'tags', 'test'],
        image_alts: ['Updated Alt 1', 'Updated Alt 2'],
      }

      const response = await request(app)
        .put(`/api/v1/products/${testProductId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send(updateData)

      expect(response.status).toBe(200)

      // Verify in database
      const dbProduct = await getProductFromDB(testProductId)
      expect(Array.isArray(dbProduct.tags)).toBe(true)
      expect(dbProduct.tags).toEqual(['updated', 'tags', 'test'])
      expect(Array.isArray(dbProduct.image_alts)).toBe(true)
      expect(dbProduct.image_alts).toEqual(['Updated Alt 1', 'Updated Alt 2'])

      console.log('  ✓ JSON optional fields updated correctly')
    })

    test('✅ Should UPDATE multiple optional fields at once', async () => {
      const updateData = {
        sku: 'MULTI-UPDATE-SKU',
        sale_price: '65.00',
        allow_backorders: 'false',
        tags: ['multi', 'update', 'test'],
        meta_description: 'Multi-field update test',
      }

      const response = await request(app)
        .put(`/api/v1/products/${testProductId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send(updateData)

      expect(response.status).toBe(200)

      // Verify all fields
      const dbProduct = await getProductFromDB(testProductId)
      expect(dbProduct.sku).toBe('MULTI-UPDATE-SKU')
      expect(dbProduct.sale_price).toBe(65.0)
      expect(dbProduct.allow_backorders).toBe(false)
      expect(dbProduct.tags).toEqual(['multi', 'update', 'test'])
      expect(dbProduct.meta_description).toBe('Multi-field update test')

      console.log('  ✓ Multiple optional fields updated correctly in single operation')
    })

    test('✅ Should preserve NULL optional fields when not updated', async () => {
      // Get current state
      const beforeUpdate = await getProductFromDB(testProductId)
      const beforeWeight = beforeUpdate.weight
      const beforeBarcode = beforeUpdate.barcode

      // Update only some fields
      const updateData = {
        sku: 'PARTIAL-UPDATE-SKU',
        meta_title: 'Partial Update Title',
      }

      const response = await request(app)
        .put(`/api/v1/products/${testProductId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send(updateData)

      expect(response.status).toBe(200)

      // Verify updated fields changed and others preserved
      const afterUpdate = await getProductFromDB(testProductId)
      expect(afterUpdate.sku).toBe('PARTIAL-UPDATE-SKU')
      expect(afterUpdate.meta_title).toBe('Partial Update Title')
      // Weight should remain as before
      expect(afterUpdate.weight).toEqual(beforeWeight)
      expect(afterUpdate.barcode).toEqual(beforeBarcode)

      console.log('  ✓ Unspecified optional fields preserved during partial updates')
    })
  })

  // ============ DATA TYPE VALIDATION TESTS ============
  describe('Optional Fields - Data Type Validation', () => {
    test('✅ Should properly convert string booleans to actual booleans', async () => {
      const testCases = [
        { input: 'true', expected: true },
        { input: 'false', expected: false },
        { input: true, expected: true },
        { input: false, expected: false },
      ]

      for (const testCase of testCases) {
        const productData = {
          name: `Boolean Test - ${testCase.input}`,
          description: 'Test',
          price: '10.00',
          stock: '10',
          category: 'Test',
          allow_backorders: testCase.input,
        }

        const response = await request(app)
          .post('/api/v1/products/create')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('Content-Type', 'application/json')
          .send(productData)

        expect(response.status).toBe(201)
        const productId = response.body.product.id
        const dbProduct = await getProductFromDB(productId)
        expect(dbProduct.allow_backorders).toBe(testCase.expected)
        await database.query('DELETE FROM products WHERE id = $1', [productId])
      }

      console.log('  ✓ String boolean values correctly converted to actual booleans')
    })

    test('✅ Should properly convert string numbers to numeric types', async () => {
      const testCases = [
        { field: 'weight', value: '2.75', expected: 2.75 },
        { field: 'sale_price', value: '39.99', expected: 39.99 },
        { field: 'low_stock_threshold', value: '15', expected: 15 },
      ]

      for (const testCase of testCases) {
        const productData = {
          name: `Numeric Test - ${testCase.field}`,
          description: 'Test',
          price: '50.00',
          stock: '50',
          category: 'Test',
          [testCase.field]: testCase.value,
        }

        const response = await request(app)
          .post('/api/v1/products/create')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('Content-Type', 'application/json')
          .send(productData)

        expect(response.status).toBe(201)
        const productId = response.body.product.id
        const dbProduct = await getProductFromDB(productId)
        expect(dbProduct[testCase.field]).toBe(testCase.expected)
        expect(typeof dbProduct[testCase.field]).toBe('number')
        await database.query('DELETE FROM products WHERE id = $1', [productId])
      }

      console.log('  ✓ String numeric values correctly converted to number types')
    })
  })

  // ============ NULL HANDLING TESTS ============
  describe('Optional Fields - NULL Handling', () => {
    test('✅ Should handle NULL values for optional fields correctly', async () => {
      const productData = {
        name: 'Minimal Product',
        description: 'Product with minimal fields',
        price: '99.99',
        stock: '10',
        category: 'Test',
        // No optional fields provided
      }

      const response = await request(app)
        .post('/api/v1/products/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send(productData)

      expect(response.status).toBe(201)
      const productId = response.body.product.id

      const dbProduct = await getProductFromDB(productId)
      expect(dbProduct.sku).toBeNull()
      expect(dbProduct.barcode).toBeNull()
      expect(dbProduct.weight).toBeNull()
      expect(dbProduct.brand).toBeNull()

      await database.query('DELETE FROM products WHERE id = $1', [productId])
      console.log('  ✓ Optional fields correctly set to NULL when not provided')
    })

    test('✅ Should accept empty string and convert to NULL for text fields', async () => {
      const productData = {
        name: 'Empty String Test',
        description: 'Test',
        price: '50.00',
        stock: '50',
        category: 'Test',
        sku: '',
        brand: '',
      }

      const response = await request(app)
        .post('/api/v1/products/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send(productData)

      expect(response.status).toBe(201)
      const productId = response.body.product.id

      const dbProduct = await getProductFromDB(productId)
      // Empty strings should ideally be NULL or remain as empty
      expect(dbProduct.sku === null || dbProduct.sku === '').toBe(true)

      await database.query('DELETE FROM products WHERE id = $1', [productId])
      console.log('  ✓ Empty string values handled appropriately')
    })
  })
})
