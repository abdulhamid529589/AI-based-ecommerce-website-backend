import express from 'express'
import { config } from 'dotenv'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import fileUpload from 'express-fileupload'
import csrf from 'csurf'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { createTables } from './utils/createTables.js'
import { errorMiddleware } from './middlewares/errorMiddleware.js'
import {
  notFoundMiddleware,
  globalErrorHandler,
  rateLimitMiddleware,
} from './middlewares/errorHandlerMiddleware.js'
import authRouter from './router/authRoutes.js'
import productRouter from './router/productRoutes.js'
import adminRouter from './router/adminRoutes.js'
import orderRouter from './router/orderRoutes.js'
import paymentGatewayRouter from './router/paymentGatewayRoutes.js'
import Stripe from 'stripe'
import database from './database/db.js'

const app = express()

config({ path: './.env' })

// Health check endpoint (must be before CORS for preflight requests)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() })
})

app.use(
  cors({
    origin: [process.env.FRONTEND_URL, process.env.DASHBOARD_URL],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  }),
)

// Stripe webhook must be before JSON parser
app.post('/api/v1/payment/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature']
  let event
  try {
    event = Stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (error) {
    return res.status(400).send(`Webhook Error: ${error.message || error}`)
  }

  // Handling the Event

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent_client_secret = event.data.object.client_secret
    try {
      // FINDING AND UPDATED PAYMENT
      const updatedPaymentStatus = 'Paid'
      const paymentTableUpdateResult = await database.query(
        `UPDATE payments SET payment_status = $1 WHERE payment_intent_id = $2 RETURNING *`,
        [updatedPaymentStatus, paymentIntent_client_secret],
      )
      await database.query(`UPDATE orders SET paid_at = NOW() WHERE id = $1 RETURNING *`, [
        paymentTableUpdateResult.rows[0].order_id,
      ])

      // Reduce Stock For Each Product
      const orderId = paymentTableUpdateResult.rows[0].order_id

      const { rows: orderedItems } = await database.query(
        `
            SELECT product_id, quantity FROM order_items WHERE order_id = $1
          `,
        [orderId],
      )

      // For each ordered item, reduce the product stock
      for (const item of orderedItems) {
        await database.query(`UPDATE products SET stock = stock - $1 WHERE id = $2`, [
          item.quantity,
          item.product_id,
        ])
      }
    } catch (error) {
      return res.status(500).send(`Error updating paid_at timestamp in orders table.`)
    }
  }
  res.status(200).send({ received: true })
})

// Security middleware - apply before routes
// Add security headers with CSP
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'js.stripe.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
        imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
        fontSrc: ["'self'", 'data:', 'cdn.jsdelivr.net'],
        connectSrc: ["'self'", 'api.stripe.com'],
        frameSrc: ["'self'", 'js.stripe.com'],
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

// 🔒 CSRF Protection - Cookie-based with secure configuration
// Uses httpOnly cookies for token storage (secure for stateless SPAs)
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: 'lax', // Allow cross-site top-level navigations
    path: '/',
  },
})

// Endpoint to get CSRF token (public, no auth required)
// This endpoint generates a fresh token that can be used for subsequent requests
app.get('/api/v1/csrf-token', csrfProtection, (req, res) => {
  try {
    const token = req.csrfToken()
    console.log('🔐 Generated CSRF token for client')
    // Return token in JSON body - client will send it back in X-CSRF-Token header
    return res.json({ csrfToken: token, success: true })
  } catch (err) {
    console.warn('⚠️ Failed to generate CSRF token:', err.message)
    return res.status(500).json({ success: false, message: 'Failed to generate CSRF token' })
  }
})

// Apply CSRF protection to state-changing routes
// This validates that the X-CSRF-Token header matches a valid token
const csrfMiddleware = (req, res, next) => {
  // Only validate CSRF for state-changing requests
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    csrfProtection(req, res, (err) => {
      if (err) {
        console.warn('⚠️ CSRF validation warning:', err.message)
        console.warn('⚠️ Request:', {
          method: req.method,
          url: req.path,
          headers: {
            'x-csrf-token': req.headers['x-csrf-token']?.substring(0, 10) + '...',
            'x-xsrf-token': req.headers['x-xsrf-token']?.substring(0, 10) + '...',
          },
          cookies: Object.keys(req.cookies),
        })

        // Return CSRF_FAILED code so client can refresh token and retry
        return res.status(403).json({
          success: false,
          code: 'CSRF_FAILED',
          message: 'CSRF token validation failed',
          shouldRefresh: true,
        })
      }
      next()
    })
  } else {
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

const paymentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // 3 payment attempts per minute
  message: 'Too many payment attempts, please try again later',
})

// Apply rate limiting to all API routes
app.use('/api/v1', rateLimitMiddleware)

// Apply CSRF to API routes
app.use('/api/v1', csrfMiddleware)

// 🔒 Add additional security headers on every response
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  next()
})

// API Routes
app.use('/api/v1/auth', authRouter)
app.use('/api/v1/product', productRouter)
app.use('/api/v1/admin', adminRouter)
app.use('/api/v1/order', orderRouter)
app.use('/api/v1/payment', paymentGatewayRouter)

// Apply strict rate limiting to critical endpoints
app.post('/api/v1/order/new', strictLimiter)
app.post('/api/v1/payment/stripe', paymentLimiter)
app.post('/api/v1/payment/bkash', paymentLimiter)
app.post('/api/v1/payment/nagad', paymentLimiter)

createTables()

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

export default app
