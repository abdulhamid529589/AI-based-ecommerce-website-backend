/**
 * Storefront bootstrap API tests
 * Run: npm test -- storefront.test.js
 */

import request from 'supertest'
import app from '../app.js'

let csrf

async function getCSRF() {
  const res = await request(app).get('/api/v1/csrf-token')
  return res.body.csrfToken
}

beforeAll(async () => {
  csrf = await getCSRF()
})

describe('GET /api/v1/content/storefront', () => {
  it('returns shop config without auth', async () => {
    const res = await request(app).get('/api/v1/content/storefront')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toBeDefined()
    expect(res.body.data.shop).toBeDefined()
    expect(Array.isArray(res.body.data.pages)).toBe(true)
    expect(Array.isArray(res.body.data.heroSlides)).toBe(true)
  })
})

describe('POST /api/v1/content/newsletter', () => {
  it('accepts a valid email', async () => {
    csrf = await getCSRF()
    const email = `test-${Date.now()}@example.com`
    const res = await request(app)
      .post('/api/v1/content/newsletter')
      .set('X-CSRF-Token', csrf)
      .send({ email })

    expect([200, 201]).toContain(res.status)
    expect(res.body.success).toBe(true)
  })

  it('rejects invalid email', async () => {
    csrf = await getCSRF()
    const res = await request(app)
      .post('/api/v1/content/newsletter')
      .set('X-CSRF-Token', csrf)
      .send({ email: 'not-an-email' })

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })
})

describe('POST /api/v1/content/contact', () => {
  it('accepts a valid inquiry', async () => {
    csrf = await getCSRF()
    const res = await request(app)
      .post('/api/v1/content/contact')
      .set('X-CSRF-Token', csrf)
      .send({
        name: 'Test User',
        email: `contact-${Date.now()}@example.com`,
        subject: 'Hello',
        message: 'Testing contact form.',
      })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
  })

  it('requires name, email, and message', async () => {
    csrf = await getCSRF()
    const res = await request(app)
      .post('/api/v1/content/contact')
      .set('X-CSRF-Token', csrf)
      .send({ name: 'Only Name' })

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })
})

describe('GET /api/v1/content/pages/:slug', () => {
  it('returns 404 for unknown slug', async () => {
    const res = await request(app).get('/api/v1/content/pages/does-not-exist-xyz')

    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
  })
})
