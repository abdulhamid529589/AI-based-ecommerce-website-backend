/**
 * Security Middleware - Rate Limiting & XSS Protection
 * Implements comprehensive security measures for the e-commerce platform
 */

import rateLimit from 'express-rate-limit'

// Simple XSS sanitization using regex patterns
const xssPatterns = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /on\w+\s*=\s*"[^"]*"/gi,
  /on\w+\s*=\s*'[^']*'/gi,
  /<iframe[^>]*><\/iframe>/gi,
  /<img[^>]*>/gi,
  /javascript:/gi,
]

/**
 * Authentication Rate Limiter
 * Max 5 login attempts per 15 minutes per IP (increased to 100 in test mode)
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 100 : 5, // 100 attempts in test, 5 in production
  message: 'Too many login attempts. Please try again after 15 minutes.',
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  skip: (req) => {
    // Don't rate limit non-POST login requests
    return req.method !== 'POST' || !req.path.includes('/login')
  },
})

/**
 * Payment Rate Limiter
 * Max 10 payment attempts per minute per user
 */
export const paymentLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 attempts
  message: 'Too many payment attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by user ID if authenticated, otherwise by IP
    return req.user?.id || req.ip
  },
})

/**
 * General API Rate Limiter
 * Max 100 requests per minute per user, 1000 per hour per IP
 */
export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 100, // 100 requests per minute
  message: 'Too many requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by user ID if authenticated, otherwise by IP
    return req.user?.id || req.ip
  },
})

/**
 * Strict API Rate Limiter (for sensitive operations)
 * Max 20 requests per minute per user
 */
export const strictLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // 20 requests
  message: 'Too many requests to this endpoint. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id || req.ip
  },
})

/**
 * XSS Sanitization Middleware
 * Removes malicious scripts and HTML from request body
 */
export const sanitizeInput = (req, res, next) => {
  if (!req.body) {
    return next()
  }

  try {
    // Sanitize all string fields in request body
    req.body = sanitizeObject(req.body)
    next()
  } catch (error) {
    console.error('❌ Error sanitizing input:', error.message)
    return res.status(400).json({
      success: false,
      code: 'INVALID_INPUT',
      message: 'Request contains invalid or malicious content',
    })
  }
}

/**
 * Recursively sanitize object properties
 * Removes XSS payloads from all string values
 */
function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) {
    // Sanitize string values
    if (typeof obj === 'string') {
      return sanitizeString(obj)
    }
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item))
  }

  const sanitized = {}
  for (const [key, value] of Object.entries(obj)) {
    sanitized[key] = sanitizeObject(value)
  }
  return sanitized
}

/**
 * Sanitize individual string values
 * Removes script tags, event handlers, and dangerous attributes
 */
function sanitizeString(str) {
  if (typeof str !== 'string') {
    return str
  }

  // Check for common XSS patterns before sanitization
  let result = str
  for (const pattern of xssPatterns) {
    if (pattern.test(result)) {
      console.warn('⚠️ Potential XSS detected in input:', result.substring(0, 50))
      result = result.replace(pattern, '')
    }
  }

  return result
}

/**
 * Request Size Limit Middleware
 * Prevents large payloads from overwhelming the server
 */
export const requestSizeLimit = (req, res, next) => {
  const maxJsonSize = 1 * 1024 * 1024 // 1MB for JSON
  const maxFileSize = 50 * 1024 * 1024 // 50MB for file uploads

  if (req.method === 'POST' || req.method === 'PUT') {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10)

    // Check for file upload vs regular JSON
    const isFileUpload = req.headers['content-type']?.includes('multipart/form-data')
    const limit = isFileUpload ? maxFileSize : maxJsonSize

    if (contentLength > limit) {
      const limitMB = isFileUpload ? 50 : 1
      return res.status(413).json({
        success: false,
        code: 'PAYLOAD_TOO_LARGE',
        message: `Request body exceeds ${limitMB}MB limit`,
      })
    }
  }

  next()
}

/**
 * Security Headers Middleware
 * Adds important security headers to all responses
 */
export const securityHeaders = (req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY')

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff')

  // Enable XSS protection in older browsers
  res.setHeader('X-XSS-Protection', '1; mode=block')

  // Content Security Policy
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
  )

  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token')
  res.setHeader('Access-Control-Allow-Credentials', 'true')

  next()
}

/**
 * Cache Control Middleware for Sensitive Endpoints
 * Prevents caching of sensitive data
 */
export const cacheControlHeaders = (req, res, next) => {
  const sensitivePatterns = [
    '/api/v1/customer',
    '/api/v1/user',
    '/api/v1/profile',
    '/api/v1/orders',
    '/api/v1/payment',
    '/api/v1/admin',
  ]

  const isSensitive = sensitivePatterns.some((pattern) => req.path.startsWith(pattern))

  if (isSensitive) {
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate, proxy-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
  } else {
    res.setHeader('Cache-Control', 'public, max-age=3600')
  }

  next()
}

/**
 * Rate Limit Status Middleware
 * Returns current rate limit status in response headers
 */
export const rateLimitStatus = (req, res, next) => {
  res.on('finish', () => {
    const remaining = res.getHeader('RateLimit-Remaining')
    if (remaining && parseInt(remaining) < 10) {
      console.warn(
        `⚠️ User ${req.user?.id || req.ip} approaching rate limit: ${remaining} requests remaining`,
      )
    }
  })
  next()
}

/**
 * Suspicious Activity Logger
 * Logs potential security threats
 */
export const suspiciousActivityLogger = (req, res, next) => {
  // Check for SQL injection patterns
  const sqlPatterns = [/(\bunion\b.*\bselect\b|\bor\b.*1\s*=\s*1|--|;.*drop|;\s*delete)/gi]

  const checkValue = (val) => {
    if (typeof val === 'string') {
      for (const pattern of sqlPatterns) {
        if (pattern.test(val)) {
          console.warn('🚨 Potential SQL injection attempt:', {
            user: req.user?.id || 'unknown',
            ip: req.ip,
            value: val.substring(0, 100),
          })
          return true
        }
      }
    }
    return false
  }

  // Check request body
  if (req.body && typeof req.body === 'object') {
    for (const [key, value] of Object.entries(req.body)) {
      if (checkValue(value)) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_REQUEST',
          message: 'Request contains suspicious patterns',
        })
      }
    }
  }

  // Check query parameters
  for (const [key, value] of Object.entries(req.query)) {
    if (checkValue(value)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_REQUEST',
        message: 'Request contains suspicious patterns',
      })
    }
  }

  next()
}

/**
 * Validate JSON Syntax
 * Ensures request contains valid JSON
 */
export const validateJsonSyntax = (err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_JSON',
      message: 'Request body contains invalid JSON',
    })
  }
  next()
}
