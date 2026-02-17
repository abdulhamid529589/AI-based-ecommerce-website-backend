import rateLimit from 'express-rate-limit'

class ErrorHandler extends Error {
  constructor(message, statusCode) {
    super(message)
    this.statusCode = statusCode
  }
}

export { ErrorHandler }

/**
 * 404 Not Found Handler
 * Called when no route matches the request
 */
export const notFoundMiddleware = (req, res, next) => {
  // Don't log 404s for health checks or known static requests
  const isHealthCheck = req.path === '/health'
  const isFavicon = req.path === '/favicon.ico'
  const isManifest = req.path === '/manifest.json'

  // Only log unexpected 404s
  if (!isHealthCheck && !isFavicon && !isManifest && process.env.NODE_ENV === 'development') {
    console.warn(`⚠️ 404 Not Found: ${req.method} ${req.originalUrl}`)
  }

  const error = new ErrorHandler(`Requested URL ${req.originalUrl} not found on this server`, 404)
  next(error)
}

/**
 * Global Error Handler
 * Catches all errors and formats response
 * Must be placed after all other middleware and routes
 */
export const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500
  err.message = err.message || 'Internal Server Error'

  // Wrong MongoDB ID error
  if (err.name === 'CastError') {
    const message = `Resource not found. Invalid: ${err.path}`
    err = new ErrorHandler(message, 400)
  }

  // JWT wrong token error
  if (err.name === 'JsonWebTokenError') {
    const message = `Json Web Token is invalid. Try again`
    err = new ErrorHandler(message, 400)
  }

  // JWT token expired error
  if (err.name === 'TokenExpiredError') {
    const message = `Json Web Token is expired. Try again`
    err = new ErrorHandler(message, 400)
  }

  // Wrong JWT secret error
  if (err.code === 'INVALID_SIGNATURE') {
    const message = `Invalid authentication token`
    err = new ErrorHandler(message, 401)
  }

  const statusCode = err.statusCode || 500
  const message = err.message

  // In production, don't expose error details
  const response = {
    success: false,
    statusCode,
    message,
  }

  // In development, include full error details
  if (process.env.NODE_ENV === 'development') {
    response.error = {
      originalError: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
    }
  }

  // Log error
  logError(err, req)

  res.status(statusCode).json(response)
}

/**
 * Request validation middleware
 * Validates common request issues
 */
export const validateRequestBody = (req, res, next) => {
  // Check content-type for POST/PUT requests
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.get('content-type')
    if (
      !contentType ||
      (!contentType.includes('application/json') && !contentType.includes('multipart/form-data'))
    ) {
      return res.status(415).json({
        success: false,
        statusCode: 415,
        message: 'Content-Type must be application/json or multipart/form-data',
      })
    }
  }

  // Check if body is empty for POST/PUT/PATCH
  if (
    ['POST', 'PUT', 'PATCH'].includes(req.method) &&
    (!req.body || Object.keys(req.body).length === 0)
  ) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: 'Request body cannot be empty',
    })
  }

  next()
}

/**
 * Rate limiting middleware
 * Limits requests to prevent abuse
 */
export const rateLimitMiddleware = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health'
  },
  keyGenerator: (req, res) => {
    // Use X-Forwarded-For header for proxy requests (e.g., Vercel, Heroku)
    return req.get('X-Forwarded-For') || req.ip
  },
})

/**
 * Database error handler
 * Handles specific database errors
 */
export const handleDatabaseError = (err) => {
  // PostgreSQL unique constraint error
  if (err.code === '23505') {
    return new ErrorHandler('This record already exists', 400)
  }

  // PostgreSQL foreign key constraint error
  if (err.code === '23503') {
    return new ErrorHandler('Cannot delete this record as it has related data', 400)
  }

  // PostgreSQL data type error
  if (err.code === '22P02') {
    return new ErrorHandler('Invalid data format provided', 400)
  }

  return err
}

/**
 * Async error handler wrapper
 * Wraps async controller functions to catch errors
 */
export const catchAsyncError = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      const dbError = handleDatabaseError(err)
      next(dbError)
    })
  }
}

/**
 * Format error response
 * Standardizes error response format
 */
export const formatErrorResponse = (error, statusCode = 500) => {
  return {
    success: false,
    statusCode,
    message: error.message || 'An error occurred',
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  }
}

/**
 * Error logger
 * Logs errors for debugging and monitoring
 */
export const logError = (error, req) => {
  const timestamp = new Date().toISOString()
  const method = req.method
  const url = req.originalUrl
  const ip = req.ip
  const errorMessage = error.message
  const statusCode = error.statusCode || 500

  // Don't log expected 404s or health check requests
  if (
    statusCode === 404 ||
    url === '/health' ||
    url === '/favicon.ico' ||
    url === '/manifest.json'
  ) {
    return // Skip logging 404 errors and static asset requests
  }

  console.error(
    `[${timestamp}] ${statusCode} ${method} ${url} - IP: ${ip} - Error: ${errorMessage}`,
  )

  // In production, you might want to send this to a logging service
  if (process.env.NODE_ENV === 'production') {
    // TODO: Send to error tracking service (e.g., Sentry, LogRocket)
  }
}

/**
 * Validation error handler
 * Handles input validation errors
 */
export const validationErrorHandler = (errors) => {
  const formattedErrors = {}

  errors.forEach((error) => {
    const field = error.param || error.field || 'unknown'
    const message = error.msg || error.message || 'Invalid value'
    formattedErrors[field] = message
  })

  return formattedErrors
}

export default {
  ErrorHandler,
  notFoundMiddleware,
  globalErrorHandler,
  validateRequestBody,
  rateLimitMiddleware,
  handleDatabaseError,
  catchAsyncError,
  formatErrorResponse,
  logError,
  validationErrorHandler,
}
