import express from 'express'
import { config } from 'dotenv'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import fileUpload from 'express-fileupload'
import crypto from 'crypto'
import helmet from 'helmet'
import compression from 'compression'
import { verifyBearerToken } from './utils/verifyAccessToken.js'
import { createTables } from './utils/createTables.js'
import { setupHealthCheck } from './utils/healthCheck.js'
import { errorMiddleware } from './middlewares/errorMiddleware.js'
import {
  notFoundMiddleware,
  globalErrorHandler,
  rateLimitMiddleware,
} from './middlewares/errorHandlerMiddleware.js'
import {
  authLimiter,
  paymentLimiter,
  sanitizeInput,
  requestSizeLimit,
  securityHeaders,
  suspiciousActivityLogger,
  cacheControlHeaders,
} from './middlewares/securityMiddleware.js'
import { updateProfile } from './controllers/authController.js'
import authRouter from './router/authRoutes.js'
import productRouter from './router/productRoutes.js'
import adminRouter from './router/adminRoutes.js'
import orderRouter from './router/orderRoutes.js'
import paymentGatewayRouter from './router/paymentGatewayRoutes.js'
import contentRouter from './router/contentRoutes.js'
import searchRouter from './routes/searchRoutes.js'
import feedRouter from './routes/feedRoutes.js'
import notificationRouter from './routes/notificationRoutes.js'
import analyticsRouter from './router/analyticsRoutes.js'
import checkoutRouter from './routes/checkoutRoutes.js'
import customerRouter from './router/customerRoutes.js'
import wishlistRouter from './routes/wishlistRoutes.js'
import cartRouter from './routes/cartRoutes.js'
import reviewRouter from './routes/reviewRoutes.js'
import advancedReviewRouter from './routes/advancedReviewRoutes.js'
import chatRouter from './routes/chatRoutes.js'
import vendorRouter from './router/vendorRoutes.js'
import shippingRouter from './router/shippingRoutes.js'
import monitoringRouter from './router/monitoringRoutes.js'
import database from './database/db.js'

const app = express()

config({ path: './.env' })

// Setup health check endpoints (must be before CORS for preflight requests)
setupHealthCheck(app)
app.get('/health', (req, res) => {
  res.status(200).type('text/plain').send('OK')
})

// 🔒 CORS Configuration - whitelist approved origins
const configuredOrigins = [process.env.FRONTEND_URL, process.env.DASHBOARD_URL].filter(Boolean)
const allowedOrigins = [
  ...new Set([
    ...configuredOrigins,
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
  ]),
]

console.log('🔐 CORS Configuration:')
console.log('   Allowed Origins:', allowedOrigins)

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true)
      }

      if (
        allowedOrigins.includes(origin) ||
        /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
      ) {
        return callback(null, true)
      }

      callback(null, false)
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-CSRF-Token',
      'X-XSRF-Token',
      'X-Idempotency-Key',
      'X-Request-ID',
    ],
  }),
)

// Payment webhook handlers are managed by payment gateway controllers
// (bKash, Nagad, Rocket, Cash on Delivery)

// Performance middleware - Enable gzip compression for responses
app.use(compression({ level: 6, threshold: 1024 })) // Compress responses > 1KB

// Security middleware - apply before routes
// Add security headers with CSP
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // ✅ MEDIUM FIX: Remove 'unsafe-inline' for scripts to prevent inline XSS
        scriptSrc: ["'self'", 'cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
        imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
        fontSrc: ["'self'", 'data:', 'cdn.jsdelivr.net'],
        connectSrc: ["'self'", 'api.bkash.com', 'api.nagad.com.bd', 'api.rocket.co'],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        childSrc: ["'self'"],
        // 🔒 Strict policy to prevent XSS, clickjacking, etc
      },
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true,
  }),
)
app.disable('x-powered-by')

// ✅ Phase 3 Security Middleware - Apply early in stack
app.use(securityHeaders) // Add security headers
app.use(cacheControlHeaders) // Add cache control headers
app.use(requestSizeLimit) // Check request size
app.use(sanitizeInput) // Sanitize XSS from inputs
app.use(suspiciousActivityLogger) // Log suspicious patterns

// Standard middleware
app.use(cookieParser())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use(
  fileUpload({
    tempFileDir: './uploads',
    useTempFiles: true,
  }),
)

// 🔒 CUSTOM CSRF PROTECTION - Simple & Reliable
// Store CSRF tokens in memory (production should use Redis, but this works for Render free tier)
const csrfTokens = new Map()

// Generate CSRF token
const generateCSRFToken = () => {
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = Date.now() + 60 * 60 * 1000 // 1 hour expiration
  csrfTokens.set(token, { createdAt: Date.now(), expiresAt })

  // Cleanup old tokens (keep map from growing indefinitely)
  if (csrfTokens.size > 10000) {
    const now = Date.now()
    for (const [key, value] of csrfTokens.entries()) {
      if (value.expiresAt < now) {
        csrfTokens.delete(key)
      }
    }
  }

  return token
}

// Validate CSRF token
const validateCSRFToken = (token) => {
  if (!token || !csrfTokens.has(token)) {
    console.warn('⚠️ CSRF validation failed: token not found or expired')
    return false
  }

  const tokenData = csrfTokens.get(token)
  if (Date.now() > tokenData.expiresAt) {
    console.warn('⚠️ CSRF validation failed: token expired')
    csrfTokens.delete(token)
    return false
  }

  // ✅ FIXED: Do NOT delete token after validation
  // CSRF tokens should be reusable for their TTL duration
  // This allows frontend to retry requests without needing a new token
  // Tokens are automatically cleaned up when they expire

  return true
}

// CSRF token endpoint (public)
app.get('/api/v1/csrf-token', (req, res) => {
  const token = generateCSRFToken()
  if (process.env.NODE_ENV !== 'production') {
    console.log('🔐 Generated CSRF token for client')
  }
  res.json({ csrfToken: token, success: true })
})

// CSRF validation middleware
const jwtCsrfExempt = (req) => {
  if (!req.headers.authorization?.startsWith('Bearer ')) {
    return false
  }
  return !!verifyBearerToken(req.headers.authorization)
}

const csrfMiddleware = (req, res, next) => {
  // Only validate CSRF for state-changing requests
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    console.log(`[CSRF] ${req.method} ${req.path} - Checking if exempt...`)

    // File uploads are JWT-authenticated, don't need CSRF
    if (req.path === '/upload/image' || req.path === '/upload') {
      console.log(`[CSRF] ✅ Exempting file upload: ${req.path}`)
      return next()
    }

    // Payment gateway webhooks/callbacks must not require CSRF
    if (req.path.includes('/callback')) {
      console.log(`[CSRF] ✅ Exempting payment callback: ${req.path}`)
      return next()
    }

    // Auth routes use JWT, not CSRF
    if (req.path.startsWith('/auth') || req.path === '/csrf-token') {
      console.log(`[CSRF] ✅ Exempting auth route: ${req.path}`)
      return next()
    }

    // Reviews are JWT-authenticated
    if (req.path.includes('/reviews')) {
      console.log(`[CSRF] ✅ Exempting reviews: ${req.path}`)
      return next()
    }

    // Product admin endpoints are JWT-authenticated with Bearer token
    // They can optionally include CSRF token but don't require it
    if (
      (req.path.includes('/admin/') || req.path === '/create' || req.path === '/bulk') &&
      jwtCsrfExempt(req)
    ) {
      console.log(`[CSRF] ✅ Admin/product endpoint with JWT auth: ${req.path}`)
      return next()
    }

    // Plural product routes use the same JWT-authenticated mutation contract
    if (
      (req.baseUrl?.includes('/product') || req.baseUrl?.includes('/products')) &&
      jwtCsrfExempt(req)
    ) {
      console.log(`[CSRF] ✅ Product mutation with JWT auth: ${req.baseUrl}${req.path}`)
      return next()
    }

    // User profile updates over JWT-authenticated endpoints can be skipped safely
    if (
      req.path === '/profile' &&
      req.baseUrl?.includes('/users') &&
      jwtCsrfExempt(req)
    ) {
      console.log(`[CSRF] ✅ User profile endpoint with JWT auth: ${req.baseUrl}${req.path}`)
      return next()
    }

    // Chat endpoints are JWT-authenticated, don't need CSRF
    if (req.path.startsWith('/chat/') && jwtCsrfExempt(req)) {
      console.log(`[CSRF] ✅ Exempting chat endpoint with JWT auth: ${req.path}`)
      return next()
    }

    // Vendor endpoints with JWT Bearer — same trust model as admin
    if (
      (req.path.startsWith('/me/') || req.path.startsWith('/admin/')) &&
      req.baseUrl?.includes('/vendor') &&
      jwtCsrfExempt(req)
    ) {
      console.log(`[CSRF] ✅ Vendor endpoint with JWT auth: ${req.baseUrl}${req.path}`)
      return next()
    }

    // Public vendor registration (mounted under /api/v1/vendor)
    if (req.path === '/register' && req.baseUrl?.includes('/vendor')) {
      console.log(`[CSRF] ✅ Exempting vendor register`)
      return next()
    }

    console.log(`[CSRF] ⚠️ Checking CSRF token for: ${req.path}`)
    const token =
      req.headers['x-csrf-token'] || req.headers['x-xsrf-token'] || (req.body && req.body._csrf)

    if (!token) {
      console.warn(`[CSRF] ❌ No token for: ${req.path}`)
      return res.status(403).json({
        success: false,
        code: 'CSRF_FAILED',
        message: 'CSRF token missing',
        shouldRefresh: true,
      })
    }

    if (!validateCSRFToken(token)) {
      console.warn(`[CSRF] ❌ Invalid token for: ${req.path}`)
      return res.status(403).json({
        success: false,
        code: 'CSRF_FAILED',
        message: 'CSRF token validation failed or expired',
        shouldRefresh: true,
      })
    }

    console.log(`[CSRF] ✅ Token valid for: ${req.path}`)
    next()
  } else {
    // GET, HEAD, OPTIONS, etc - no CSRF needed
    next()
  }
}

// Admin-specific CSRF middleware (exempts file uploads)
const adminCsrfMiddleware = (req, res, next) => {
  console.log(`[adminCsrfMiddleware] Path: "${req.path}", Method: ${req.method}`)

  // File upload endpoints are JWT-authenticated, not CSRF-protected
  if (req.path === '/upload/image' || req.path === '/upload') {
    console.log(`  ✅ Skipping CSRF for admin file upload: ${req.path}`)
    return next()
  }

  console.log(`  → Calling standard csrfMiddleware for: ${req.path}`)
  // For all other admin routes, use standard CSRF validation
  return csrfMiddleware(req, res, next)
}

// 🔒 Strict rate limiting for critical operations (applied on routes — see orderRoutes / payment)
// NOTE: Do not register app.post('/api/v1/order/new', limiter) AFTER routers — Express never reaches it.

// Apply rate limiting to all API routes
app.use('/api/v1', rateLimitMiddleware)

// 🔒 Add additional security headers on every response
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  next()
})

// ✅ Response timestamp middleware - Inject timestamp into all success responses
app.use((req, res, next) => {
  const originalJson = res.json
  res.json = function (data) {
    // Only add timestamp if this is a success response and doesn't already have one
    if (data && data.success === true && !data.timestamp) {
      data.timestamp = new Date().toISOString()
    }
    return originalJson.call(this, data)
  }
  next()
})

// API Routes
app.use('/api/v1/auth', authLimiter, authRouter) // ✅ Phase 3: Auth rate limiting - NO CSRF needed (JWT protected)
app.use('/api/v1/product', csrfMiddleware, productRouter) // ✅ CSRF required for product mutations
app.use('/api/v1/products', csrfMiddleware, productRouter) // ✅ Compatibility for plural REST-style product routes
app.use('/api/v1/admin', csrfMiddleware, adminRouter) // ✅ CSRF for admin, but exempts file uploads
app.use('/api/v1/order', csrfMiddleware, orderRouter) // ✅ CSRF required for orders
app.use('/api/v1/payment', paymentLimiter, csrfMiddleware, paymentGatewayRouter) // ✅ Phase 3: Payment rate limiting
// 🔴 ATTACH SOCKET.IO TO REQUESTS (for real-time broadcasts)
app.use((req, res, next) => {
  req.io = req.app.get('io')
  next()
})

app.use('/api/v1/content', csrfMiddleware, contentRouter) // ✅ CSRF required for content management
app.use('/api/v1/search', searchRouter)
app.use('/api/v1/feed', feedRouter)
app.use('/api/v1/notifications', notificationRouter)
app.use('/api/v1/analytics', analyticsRouter)
app.use('/api/v1/checkout', csrfMiddleware, checkoutRouter) // ✅ CSRF required for checkout
app.use('/api/v1/customer', csrfMiddleware, customerRouter) // ✅ CSRF required for customer operations

// ✅ Phase 4: Advanced Features - Wishlist, Cart, Reviews
app.use(wishlistRouter)
app.use(cartRouter)
app.use(reviewRouter)
app.use(advancedReviewRouter)

// ✅ Phase 5: Live Chat - Real-time messaging
app.use('/api/v1/chat', csrfMiddleware, chatRouter)

// 🏪 Multi-vendor marketplace (JWT-authenticated mutations; CSRF optional with Bearer)
app.use('/api/v1/vendor', csrfMiddleware, vendorRouter)

// 🚚 Shipping zones / quotes
app.use('/api/v1/shipping', csrfMiddleware, shippingRouter)

// 📊 Monitoring stubs (Admin metrics / client beacons)
app.use('/api/v1/monitoring', csrfMiddleware, monitoringRouter)

// Initialize database tables outside of the test environment.
// Jest imports the app without waiting for async startup work, so avoid
// background logs that happen after tests finish.
if (process.env.NODE_ENV !== 'test') {
  createTables().catch((error) => {
    console.warn('⚠️ Failed to initialize database tables:', error.message)
    console.warn('⚠️ Server will continue running, but some features may not work properly')
  })
}

// 🔒 CSRF Error handler - handle CSRF token mismatches gracefully
app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    console.warn('⚠️ CSRF token validation failed - attempting recovery')
    // CSRF token errors usually mean:
    // 1. Token expired
    // 2. First request (no token yet)
    // 3. Token not sent in headers
    // For now, log and let frontend know to refresh token
    return res.status(403).json({
      success: false,
      message: 'CSRF token validation failed. Please refresh and try again.',
      code: 'CSRF_FAILED',
      shouldRefresh: true,
    })
  }
  next(err)
})

// 404 Not Found handler - must be before error handler
app.use(notFoundMiddleware)

// Global error handler - must be last
app.use(errorMiddleware)
app.use(globalErrorHandler)

// Export for both ES6 and CommonJS (Jest tests)
export default app
if (typeof module !== 'undefined' && module.exports) {
  module.exports = app
}
