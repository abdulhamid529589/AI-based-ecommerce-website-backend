import express from 'express'
import { config } from 'dotenv'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import fileUpload from 'express-fileupload'
import crypto from 'crypto'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { createTables } from './utils/createTables.js'
import { errorMiddleware } from './middlewares/errorMiddleware.js'
import {
  notFoundMiddleware,
  globalErrorHandler,
  rateLimitMiddleware,
} from './middlewares/errorHandlerMiddleware.js'
import {
  authLimiter,
  paymentLimiter,
  apiLimiter,
  sanitizeInput,
  requestSizeLimit,
  securityHeaders,
  suspiciousActivityLogger,
  cacheControlHeaders,
} from './middlewares/securityMiddleware.js'
import { isAuthenticated } from './middlewares/authMiddleware.js'
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
import database from './database/db.js'

const app = express()

config({ path: './.env' })

// Health check endpoint (must be before CORS for preflight requests)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date(),
    csrfSystem: 'custom-token-generation-v2',
  })
})

// 🔒 CORS Configuration - whitelist approved origins
const allowedOrigins = [process.env.FRONTEND_URL, process.env.DASHBOARD_URL].filter(Boolean) // Remove undefined values

console.log('🔐 CORS Configuration:')
console.log(
  '   Allowed Origins:',
  allowedOrigins.length > 0 ? allowedOrigins : 'ALL (development mode)',
)

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true, // If no origins specified, allow all (dev only)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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

// Endpoint to get CSRF token (public, no auth required)
app.get('/api/v1/csrf-token', (req, res) => {
  const token = generateCSRFToken()
  console.log('🔐 Generated CSRF token for client')
  res.json({ csrfToken: token, success: true })
})

// DEBUG: Endpoint to check current user's token role
app.get('/api/v1/debug/token-role', isAuthenticated, (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  let tokenRole = 'unknown'
  if (token) {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
      tokenRole = payload.role
    } catch (e) {
      tokenRole = 'decode-error'
    }
  }
  res.json({
    dbRole: req.user?.role,
    tokenRole: tokenRole,
    userId: req.user?.id,
    userName: req.user?.name,
    match: req.user?.role === tokenRole,
  })
})

// CSRF validation middleware
const csrfMiddleware = (req, res, next) => {
  // 🔍 DEBUG: Log CSRF middleware activity
  console.log(`🔒 CSRF Check - Method: ${req.method}, Path: ${req.path}`)

  // Only validate CSRF for state-changing requests
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    // Auth routes and CSRF token endpoint DON'T need CSRF tokens
    // They use JWT authentication instead
    // Also exempt reviews endpoints since they require authentication
    if (
      req.path.startsWith('/auth') ||
      req.path === '/csrf-token' ||
      req.path.includes('/reviews')
    ) {
      console.log(`  ✅ Skipping CSRF for ${req.path}`)
      return next()
    }

    const token =
      req.headers['x-csrf-token'] || req.headers['x-xsrf-token'] || (req.body && req.body._csrf)

    if (!token) {
      console.warn('⚠️ CSRF token missing in request')
      return res.status(403).json({
        success: false,
        code: 'CSRF_FAILED',
        message: 'CSRF token missing',
        shouldRefresh: true,
      })
    }

    if (!validateCSRFToken(token)) {
      console.warn('⚠️ CSRF validation failed - invalid or expired token')
      return res.status(403).json({
        success: false,
        code: 'CSRF_FAILED',
        message: 'CSRF token validation failed or expired',
        shouldRefresh: true,
      })
    }

    console.log(`  ✅ CSRF token validated`)
    next()
  } else {
    // GET, HEAD, OPTIONS, etc - no CSRF needed
    console.log(`  ✅ Skipping CSRF for ${req.method} request`)
    next()
  }
}

// 🔒 Strict rate limiting for critical operations
const strictLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute
  message: 'Too many order attempts, please wait before trying again',
  skip: (req) => req.user?.role === 'Admin', // Exempt admins
})

const paymentLimiter_legacy = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // 3 payment attempts per minute
  message: 'Too many payment attempts, please try again later',
})

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
app.use('/api/v1/admin', csrfMiddleware, adminRouter) // ✅ CSRF required for admin routes
app.use('/api/v1/order', csrfMiddleware, orderRouter) // ✅ CSRF required for orders
app.use('/api/v1/payment', paymentLimiter, csrfMiddleware, paymentGatewayRouter) // ✅ Phase 3: Payment rate limiting
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

// ✅ Phase 3: General API rate limiting (applies to all /api/v1 routes)
app.use('/api/v1', apiLimiter)

// Apply strict rate limiting to critical endpoints
app.post('/api/v1/order/new', strictLimiter)
app.post('/api/v1/payment/bkash', paymentLimiter)
app.post('/api/v1/payment/nagad', paymentLimiter)

// Initialize database tables (non-blocking - errors logged but don't crash)
createTables().catch((error) => {
  console.warn('⚠️ Failed to initialize database tables:', error.message)
  console.warn('⚠️ Server will continue running, but some features may not work properly')
})

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
