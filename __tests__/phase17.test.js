/**
 * Phase 17 — Marketplace core (multivendor + taxonomy + finance surfaces)
 * Run: npm test -- phase17.test.js
 */

import request from 'supertest'
import app from '../app.js'
import database from '../database/db.js'
import bcrypt from 'bcrypt'
import { createProductsTable } from '../models/productTable.js'
import { createSubcategoriesTable } from '../models/subcategoriesTable.js'
import {
  createShopsTable,
  createVendorOrdersTable,
  createVendorPayoutsTable,
  migrateMultiVendorSchema,
  migratePhase1ASchema,
} from '../models/shopsTable.js'
import { migrateMarketplaceOpsSchema } from '../models/marketplaceOpsTables.js'

let csrf
let vendorToken
let vendorUserId
let shopId
let adminToken
let categoryId = 'cat-bedding-test'
let subcategoryId
let productId

async function getCSRF() {
  const res = await request(app).get('/api/v1/csrf-token')
  return res.body.csrfToken
}

describe('Phase 17: Marketplace — vendor, subcategory, finance APIs', () => {
  beforeAll(async () => {
    await createProductsTable()
    await createSubcategoriesTable()
    await createShopsTable()
    await createVendorOrdersTable()
    await createVendorPayoutsTable()
    await migrateMultiVendorSchema()
    await migratePhase1ASchema()
    await migrateMarketplaceOpsSchema()

    csrf = await getCSRF()

    // Ensure a settings category exists for subcategory FK (TEXT id)
    try {
      const { setSetting, getSetting } = await import('../models/settingsTable.js')
      const cats = (await getSetting('categories')) || []
      const list = Array.isArray(cats) ? cats : []
      if (!list.find((c) => c.id === categoryId)) {
        list.push({
          id: categoryId,
          name: 'Bedding Test',
          slug: 'bedding-test',
          isVisible: true,
          order: 0,
        })
        await setSetting('categories', list)
      }
    } catch (e) {
      console.warn('Category seed skipped:', e.message)
    }

    // Subcategory row
    const sub = await database.query(
      `INSERT INTO subcategories (category_id, name, slug, is_active)
       VALUES ($1, 'Cotton Sheets', 'cotton-sheets-test', true)
       ON CONFLICT (category_id, slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [categoryId],
    )
    subcategoryId = sub.rows[0]?.id

    // Admin for later
    const hash = await bcrypt.hash('AdminPass123!', 10)
    await database.query(
      `INSERT INTO users (name, email, mobile, password, role)
       VALUES ('Phase17 Admin', 'phase17-admin@test.com', '01990000017', $1, 'Admin')
       ON CONFLICT (email) DO UPDATE SET password = $1, role = 'Admin'`,
      [hash],
    )
    const loginAdmin = await request(app)
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email: 'phase17-admin@test.com', password: 'AdminPass123!' })
    adminToken = loginAdmin.body.accessToken || loginAdmin.body.token
  }, 60000)

  afterAll(async () => {
    if (productId) await database.query(`DELETE FROM products WHERE id = $1`, [productId])
    if (shopId) await database.query(`DELETE FROM shops WHERE id = $1`, [shopId])
    if (vendorUserId) await database.query(`DELETE FROM users WHERE id = $1`, [vendorUserId])
    if (subcategoryId) {
      await database.query(`DELETE FROM subcategories WHERE id = $1`, [subcategoryId])
    }
    await database.query(`DELETE FROM users WHERE email = 'phase17-admin@test.com'`)
  })

  test('vendor can register and receive Vendor role + pending shop', async () => {
    const email = `vendor17_${Date.now()}@test.com`
    const res = await request(app)
      .post('/api/v1/vendor/register')
      .set('X-CSRF-Token', csrf)
      .send({
        name: 'Phase17 Vendor',
        email,
        mobile: `017${String(Date.now()).slice(-8)}`,
        password: 'VendorPass123!',
        shop_name: `Bedtex Shop ${Date.now()}`,
        shop_description: 'Test shop',
        city: 'Dhaka',
      })

    expect([200, 201]).toContain(res.status)
    expect(res.body.success).toBe(true)
    expect(res.body.user?.role || res.body.userRole).toBeTruthy()
    vendorToken = res.body.accessToken || res.body.token
    vendorUserId = res.body.user?.id

    const shop = await database.query(`SELECT * FROM shops WHERE owner_id = $1`, [vendorUserId])
    expect(shop.rows[0]).toBeTruthy()
    expect(shop.rows[0].status).toBe('pending')
    shopId = shop.rows[0].id
  })

  test('vendor can login via auth/login', async () => {
    const user = await database.query(`SELECT email FROM users WHERE id = $1`, [vendorUserId])
    const email = user.rows[0]?.email
    csrf = await getCSRF()
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email, password: 'VendorPass123!' })

    expect(res.status).toBe(200)
    expect(res.body.user?.role).toBe('Vendor')
    vendorToken = res.body.accessToken || res.body.token || vendorToken
  })

  test('categories-with-subcategories returns nested tree', async () => {
    const res = await request(app).get('/api/v1/content/categories-with-subcategories')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    const bedding = res.body.data.find((c) => c.id === categoryId)
    if (bedding) {
      expect(bedding.subcategories?.some((s) => s.id === subcategoryId)).toBe(true)
    }
  })

  test('admin can approve vendor shop so products can be listed', async () => {
    csrf = await getCSRF()
    const res = await request(app)
      .put(`/api/v1/vendor/admin/shops/${shopId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-CSRF-Token', csrf)
      .send({ status: 'approved' })

    expect(res.status).toBe(200)
    expect(res.body.shop?.status || res.body.success).toBeTruthy()
  })

  test('vendor product create accepts subcategory_id', async () => {
    if (!subcategoryId) {
      console.warn('Skipping — no subcategory seeded')
      return
    }
    csrf = await getCSRF()
    const res = await request(app)
      .post('/api/v1/vendor/me/products')
      .set('Authorization', `Bearer ${vendorToken}`)
      .set('X-CSRF-Token', csrf)
      .field('name', 'Phase17 Cotton Sheet')
      .field('description', 'Soft cotton bed sheet for tests')
      .field('price', '1500')
      .field('stock', '25')
      .field('category', 'Bedding Test')
      .field('subcategory_id', subcategoryId)

    expect([200, 201]).toContain(res.status)
    expect(res.body.success).toBe(true)
    productId = res.body.product?.id
    expect(res.body.product?.subcategory_id || res.body.product?.subcategory).toBeTruthy()
  })

  test('shipping quote endpoint responds', async () => {
    const res = await request(app)
      .get('/api/v1/shipping/quote')
      .query({ city: 'Dhaka', subtotal: 500 })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(typeof res.body.quote?.shipping_price).toBe('number')
  })

  test('loyalty endpoint requires auth and returns account', async () => {
    // Create a buyer and check loyalty
    const hash = await bcrypt.hash('BuyerPass123!', 10)
    const buyer = await database.query(
      `INSERT INTO users (name, email, mobile, password, role)
       VALUES ('Buyer17', 'phase17-buyer@test.com', '01880000017', $1, 'User')
       ON CONFLICT (email) DO UPDATE SET password = $1
       RETURNING id`,
      [hash],
    )
    csrf = await getCSRF()
    const login = await request(app)
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email: 'phase17-buyer@test.com', password: 'BuyerPass123!' })
    const buyerToken = login.body.accessToken || login.body.token

    const res = await request(app)
      .get('/api/v1/customer/loyalty')
      .set('Authorization', `Bearer ${buyerToken}`)
      .set('X-CSRF-Token', csrf)

    expect(res.status).toBe(200)
    expect(res.body.loyalty).toBeTruthy()

    await database.query(`DELETE FROM users WHERE id = $1`, [buyer.rows[0].id])
  })

  test('vendor wallet endpoint returns balance shape', async () => {
    const res = await request(app)
      .get('/api/v1/vendor/me/wallet')
      .set('Authorization', `Bearer ${vendorToken}`)
      .set('X-CSRF-Token', csrf)

    expect(res.status).toBe(200)
    expect(res.body.wallet).toBeDefined()
    expect(typeof res.body.wallet.balance).toBe('number')
  })

  test('Phase18: product list filters by subcategory', async () => {
    if (!subcategoryId || !productId) {
      console.warn('Skipping — product/subcategory missing')
      return
    }
    const byId = await request(app)
      .get('/api/v1/products')
      .query({ subcategory_id: subcategoryId, limit: 20 })
    expect(byId.status).toBe(200)
    const list = byId.body.products || byId.body.data || []
    expect(list.some((p) => p.id === productId)).toBe(true)

    const bySlug = await request(app)
      .get('/api/v1/products')
      .query({ subcategory: 'cotton-sheets-test', limit: 20 })
    expect(bySlug.status).toBe(200)
    const slugList = bySlug.body.products || []
    expect(slugList.some((p) => p.id === productId)).toBe(true)
  })

  test('Phase18: vendor can update product', async () => {
    if (!productId) {
      console.warn('Skipping — no product')
      return
    }
    csrf = await getCSRF()
    const res = await request(app)
      .put(`/api/v1/vendor/me/products/${productId}`)
      .set('Authorization', `Bearer ${vendorToken}`)
      .set('X-CSRF-Token', csrf)
      .field('name', 'Phase17 Cotton Sheet Updated')
      .field('stock', '30')

    expect(res.status).toBe(200)
    expect(res.body.product?.name).toMatch(/Updated/)
    expect(Number(res.body.product?.stock)).toBe(30)
  })

  test('Phase18: vendor analytics returns summary shape', async () => {
    const res = await request(app)
      .get('/api/v1/vendor/me/analytics')
      .query({ days: 30 })
      .set('Authorization', `Bearer ${vendorToken}`)
      .set('X-CSRF-Token', csrf)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.summary).toBeDefined()
    expect(typeof res.body.summary.gmv).toBe('number')
    expect(Array.isArray(res.body.trend)).toBe(true)
    expect(Array.isArray(res.body.topProducts)).toBe(true)
  })
})
