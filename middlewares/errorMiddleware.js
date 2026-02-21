class ErrorHandler extends Error {
  constructor(message, statusCode) {
    super(message)
    this.statusCode = statusCode
  }
}

export const errorMiddleware = (err, req, res, next) => {
  err.message = err.message || 'Internal Server Error'
  err.statusCode = err.statusCode || 500

  // Skip logging for expected errors (404, expired JWT, etc)
  const shouldSkipLogging =
    err.statusCode === 404 ||
    err.name === 'TokenExpiredError' ||
    err.message?.includes('not found on this server')

  if (!shouldSkipLogging) {
    console.error('❌ Error:', err.message)
    console.error('📍 Stack:', err.stack)
  }

  if (err.code === 11000) {
    const message = `Duplicate field value entered`
    err = new ErrorHandler(message, 400)
  }

  if (err.name === 'JsonWebTokenError') {
    const message = 'JSON Web Token is invalid, try again'
    err = new ErrorHandler(message, 400)
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'JSON Web Token has expired, try again'
    err = new ErrorHandler(message, 400)
  }

  if (err.name === 'CastError') {
    const message = `Invalid ${err.path}: ${err.value}`
    err = new ErrorHandler(message, 400)
  }

  const errorMessage = err.errors
    ? Object.values(err.errors)
        .map((error) => error.message)
        .join(' ')
    : err.message

  // Map status codes to error codes
  const getErrorCode = (statusCode) => {
    switch (statusCode) {
      case 401:
        return 'UNAUTHORIZED'
      case 403:
        return 'FORBIDDEN'
      case 404:
        return 'NOT_FOUND'
      case 400:
        return 'BAD_REQUEST'
      case 500:
        return 'INTERNAL_SERVER_ERROR'
      default:
        return 'ERROR'
    }
  }

  return res.status(err.statusCode).json({
    success: false,
    message: errorMessage,
    code: getErrorCode(err.statusCode),
    timestamp: new Date().toISOString(),
  })
}

export default ErrorHandler
