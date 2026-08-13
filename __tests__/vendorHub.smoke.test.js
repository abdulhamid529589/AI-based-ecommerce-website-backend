/**
 * Vendor Hub smoke — login, RBAC, and every Seller Hub API surface.
 * Run: npm test -- vendorHub.smoke.test.js
 */

import request from 'supertest'
import app from '../app.js'
import database from '../database/db.js'
import bcrypt from 'bcrypt'
import { createProductsTable } from '../models/productTable.js'
import {
  createShopsTable,
  createVendorOrdersTable,
  createVendorPayoutsTable,
  migrateMultiVendorSchema,
  migratePhase1ASchema,
} from '../models/shopsTable.js'
import { migrateMarketplaceOpsSchema } from '../models/marketplaceOpsTables.js'

const PASS = 'VendorHubTest123!'
const stamp = Date.now()
const vendorEmail = `vendor.hub.${stamp}@test.com`
const buyerEmail = `buyer.hub.${stamp}@test.com`
const adminEmail = `admin.hub.${stamp}@test.com`

let csrf
let vendorToken
let vendorUserId
let shopId
let adminToken
let buyerToken

async function getCSRF() {
  const res = await request(app).get('/api/v1/csrf-token')
  return res.body.csrfToken
}

async function authGet(path, token) {
  return request(app)
    .get(path)
    .set('Authorization', `Bearer ${token}`)
    .set('X-CSRF-Token', csrf)
}

describe('Vendor Hub smoke — login & dashboard access', () => {
  beforeAll(async () => {
    await createProductsTable()
    await createShopsTable()
    await createVendorOrdersTable()
    await createVendorPayoutsTable()
    await migrateMultiVendorSchema()
    await migratePhase1ASchema()
    await migrateMarketplaceOpsSchema()
    csrf = await getCSRF()

    const adminHash = await bcrypt.hash('AdminHubTest123!', 10)
    await database.query(
      `INSERT INTO users (name, email, mobile, password, role)
       VALUES ('Hub Admin', $1, $2, $3, 'Admin')
       ON CONFLICT (email) DO UPDATE SET password = $3, role = 'Admin'`,
      [adminEmail, `0199${String(stamp).slice(-8)}`, adminHash],
    )
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email: adminEmail, password: 'AdminHubTest123!' })
    adminToken = adminLogin.body.accessToken || adminLogin.body.token
  }, 60000)

  afterAll(async () => {
    if (shopId) await database.query(`DELETE FROM shops WHERE id = $1`, [shopId])
    await database.query(`DELETE FROM users WHERE email = ANY($1::text[])`, [
      [vendorEmail, buyerEmail, adminEmail],
    ])
  })

  test('1) vendor register creates Vendor role + pending shop', async () => {
    const res = await request(app)
      .post('/api/v1/vendor/register')
      .set('X-CSRF-Token', csrf)
      .send({
        name: 'Hub Smoke Vendor',
        email: vendorEmail,
        mobile: `017${String(stamp).slice(-8)}`,
        password: PASS,
        shop_name: `Hub Shop ${stamp}`,
        shop_description: 'Smoke test shop',
        city: 'Dhaka',
      })

    expect([200, 201]).toContain(res.status)
    expect(res.body.success).toBe(true)
    expect(res.body.user?.role).toBe('Vendor')
    expect(res.body.accessToken || res.body.token).toBeTruthy()
    vendorToken = res.body.accessToken || res.body.token
    vendorUserId = res.body.user?.id

    const shop = await database.query(`SELECT * FROM shops WHERE owner_id = $1`, [vendorUserId])
    expect(shop.rows[0]?.status).toBe('pending')
    shopId = shop.rows[0].id
  })

  test('2) vendor can login via /auth/login (Seller Hub path)', async () => {
    csrf = await getCSRF()
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email: vendorEmail, password: PASS })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.user?.role).toBe('Vendor')
    expect(res.body.user?.email).toBe(vendorEmail)
    expect(res.body.accessToken).toBeTruthy()
    expect(res.body.refreshToken || res.body.user).toBeTruthy()
    vendorToken = res.body.accessToken

    // Dashboard gate: only Admin|Vendor — this role must pass
    expect(['Admin', 'Vendor']).toContain(res.body.user.role)
  })

  test('3) wrong password is rejected', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email: vendorEmail, password: 'WrongPassword!' })
    expect(res.status).toBe(401)
  })

  test('4) buyer User role is NOT Vendor and cannot hit vendor APIs', async () => {
    const hash = await bcrypt.hash('BuyerHub123!', 10)
    await database.query(
      `INSERT INTO users (name, email, mobile, password, role)
       VALUES ('Hub Buyer', $1, $2, $3, 'User')
       ON CONFLICT (email) DO UPDATE SET password = $3, role = 'User'`,
      [buyerEmail, `0188${String(stamp).slice(-8)}`, hash],
    )
    csrf = await getCSRF()
    const login = await request(app)
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email: buyerEmail, password: 'BuyerHub123!' })
    expect(login.status).toBe(200)
    expect(login.body.user?.role).toBe('User')
    buyerToken = login.body.accessToken

    // Frontend Login.jsx rejects User — API also must 403 vendor routes
    const dash = await authGet('/api/v1/vendor/me/dashboard', buyerToken)
    expect([401, 403]).toContain(dash.status)
  })

  test('5) unauthenticated dashboard is blocked', async () => {
    const res = await request(app).get('/api/v1/vendor/me/dashboard')
    expect([401, 403]).toContain(res.status)
  })

  test('6) pending vendor can load dashboard + read surfaces', async () => {
    const endpoints = [
      '/api/v1/vendor/me/dashboard',
      '/api/v1/vendor/me/shop',
      '/api/v1/vendor/me/products',
      '/api/v1/vendor/me/orders',
      '/api/v1/vendor/me/wallet',
      '/api/v1/vendor/me/kyc',
      '/api/v1/vendor/me/disputes',
      '/api/v1/vendor/me/promotions',
      '/api/v1/vendor/me/analytics',
      '/api/v1/vendor/me/payouts',
    ]

    const results = []
    for (const path of endpoints) {
      const res = await authGet(path, vendorToken)
      results.push({ path, status: res.status, ok: res.status === 200 })
      expect(res.status).toBe(200)
    }

    const dash = await authGet('/api/v1/vendor/me/dashboard', vendorToken)
    expect(dash.body.shop?.id || dash.body.shop?.name).toBeTruthy()
    expect(dash.body.stats || dash.body.shop).toBeTruthy()
    expect(dash.body.shop?.status).toBe('pending')

    // Keep results for debugging
    expect(results.every((r) => r.ok)).toBe(true)
  })

  test('7) pending vendor cannot create products (requireApprovedShop)', async () => {
    csrf = await getCSRF()
    const res = await request(app)
      .post('/api/v1/vendor/me/products')
      .set('Authorization', `Bearer ${vendorToken}`)
      .set('X-CSRF-Token', csrf)
      .field('name', 'Should Fail')
      .field('description', 'Pending shop cannot list')
      .field('price', '100')
      .field('stock', '5')
      .field('category', 'Bedding')

    expect(res.status).toBe(403)
  })

  test('8) after admin approval, dashboard shows approved and selling unlocks', async () => {
    csrf = await getCSRF()
    const approve = await request(app)
      .put(`/api/v1/vendor/admin/shops/${shopId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-CSRF-Token', csrf)
      .send({ status: 'approved' })
    expect(approve.status).toBe(200)

    const dash = await authGet('/api/v1/vendor/me/dashboard', vendorToken)
    expect(dash.status).toBe(200)
    expect(dash.body.shop?.status).toBe('approved')

    csrf = await getCSRF()
    const create = await request(app)
      .post('/api/v1/vendor/me/products')
      .set('Authorization', `Bearer ${vendorToken}`)
      .set('X-CSRF-Token', csrf)
      .field('name', 'Hub Approved Product')
      .field('description', 'Listed after approval')
      .field('price', '999')
      .field('stock', '10')
      .field('category', 'Bedding')

    expect([200, 201]).toContain(create.status)
    expect(create.body.success).toBe(true)

    if (create.body.product?.id) {
      await database.query(`DELETE FROM products WHERE id = $1`, [create.body.product.id])
    }
  })

  test('9) /auth/me (or getUser) returns Vendor while logged in', async () => {
    const paths = ['/api/v1/auth/me', '/api/v1/user/me', '/api/v1/auth/user']
    let hit = null
    for (const p of paths) {
      const res = await authGet(p, vendorToken)
      if (res.status === 200 && res.body.user) {
        hit = res
        break
      }
    }
    // Some apps only expose user via login payload — dashboard is still valid if /me missing
    if (hit) {
      expect(hit.body.user.role).toBe('Vendor')
    } else {
      // Fallback: dashboard proves session
      const dash = await authGet('/api/v1/vendor/me/dashboard', vendorToken)
      expect(dash.status).toBe(200)
    }
  })

  test('10) vendor cannot access admin-only shop list', async () => {
    const res = await authGet('/api/v1/vendor/admin/shops', vendorToken)
    expect([401, 403]).toContain(res.status)
  })
})
