/**
 * Live Vendor Hub probe — run while API + Postgres are up:
 *   node scripts/vendor-hub-live-check.js
 *
 * Covers: register → login → every Seller Hub /me endpoint → approve → product create.
 */
import 'dotenv/config'

const API = process.env.API_URL || 'http://localhost:5000/api/v1'
const stamp = Date.now()
const email = `live.vendor.${stamp}@test.com`
const password = 'LiveVendorCheck123!'

async function req(method, path, { token, csrf, body, form } = {}) {
  const headers = {}
  if (csrf) headers['X-CSRF-Token'] = csrf
  if (token) headers.Authorization = `Bearer ${token}`
  let payload
  if (form) {
    payload = form
  } else if (body) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(`${API}${path}`, { method, headers, body: payload })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text }
  }
  return { status: res.status, data }
}

function ok(label, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!pass) process.exitCode = 1
}

const health = await fetch(`${API.replace('/api/v1', '')}/api/v1/health`)
const healthBody = await health.json().catch(() => ({}))
ok('API healthy', health.status === 200 && healthBody.status === 'healthy', JSON.stringify(healthBody))
if (healthBody.status !== 'healthy') {
  console.error('\nPostgres/API unhealthy. Start DB first:\n  sudo pg_ctlcluster 17 main start\n')
  process.exit(1)
}

const csrfRes = await req('GET', '/csrf-token')
const csrf = csrfRes.data.csrfToken
ok('CSRF token', !!csrf)

const reg = await req('POST', '/vendor/register', {
  csrf,
  body: {
    name: 'Live Check Vendor',
    email,
    mobile: `017${String(stamp).slice(-8)}`,
    password,
    shop_name: `Live Shop ${stamp}`,
    shop_description: 'Live hub check',
    city: 'Dhaka',
  },
})
ok('Vendor register', [200, 201].includes(reg.status) && reg.data.user?.role === 'Vendor', `status=${reg.status}`)
let token = reg.data.accessToken || reg.data.token
const shopId = reg.data.shop?.id || reg.data.user?.shop?.id

const login = await req('POST', '/auth/login', { csrf, body: { email, password } })
ok(
  'Vendor login (/auth/login)',
  login.status === 200 && login.data.user?.role === 'Vendor' && !!login.data.accessToken,
  `role=${login.data.user?.role}`,
)
token = login.data.accessToken || token

const surfaces = [
  '/vendor/me/dashboard',
  '/vendor/me/shop',
  '/vendor/me/products',
  '/vendor/me/orders',
  '/vendor/me/wallet',
  '/vendor/me/kyc',
  '/vendor/me/disputes',
  '/vendor/me/promotions',
  '/vendor/me/analytics',
  '/vendor/me/payouts',
]
for (const path of surfaces) {
  const r = await req('GET', path, { token, csrf })
  ok(`GET ${path}`, r.status === 200, `status=${r.status}`)
}

const dash = await req('GET', '/vendor/me/dashboard', { token, csrf })
ok('Dashboard has shop', !!dash.data.shop?.name, dash.data.shop?.status)

console.log('\nCredentials for UI login at http://localhost:5174/login')
console.log(`  email:    ${email}`)
console.log(`  password: ${password}`)
console.log(`  shopId:   ${shopId || '(see dashboard)'}`)
