import jwt from 'jsonwebtoken'
import { catchAsyncErrors } from './catchAsyncError.js'
import ErrorHandler from './errorMiddleware.js'
import database from '../database/db.js'

export const isAuthenticated = catchAsyncErrors(async (req, res, next) => {
  let token = null
  let tokenSource = null

  // Priority 1: Check cookies first (for browser requests)
  if (req.cookies?.token) {
    token = req.cookies.token
    tokenSource = 'cookie:token'
  } else if (req.cookies?.accessToken) {
    token = req.cookies.accessToken
    tokenSource = 'cookie:accessToken'
  }
  // Priority 2: Check Authorization header (for frontend SPA requests)
  else if (req.headers.authorization) {
    const authHeader = req.headers.authorization
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7)
      tokenSource = 'header:bearer'
    }
  }

  if (!token) {
    console.warn('⚠️ No token found in cookies or headers')
    console.warn('   Cookies:', Object.keys(req.cookies || {}))
    console.warn('   Authorization header:', req.headers.authorization ? 'present' : 'missing')
    return next(new ErrorHandler('Please login to access this resource.', 401))
  }

  try {
    const secretKey = process.env.JWT_SECRET_KEY_ACCESS || process.env.JWT_SECRET_KEY

    if (!secretKey) {
      console.error('❌ JWT_SECRET_KEY environment variables not configured!')
      console.error('   JWT_SECRET_KEY_ACCESS:', process.env.JWT_SECRET_KEY_ACCESS ? '✓' : '✗')
      console.error('   JWT_SECRET_KEY:', process.env.JWT_SECRET_KEY ? '✓' : '✗')
      return next(new ErrorHandler('Server configuration error. Please try again later.', 500))
    }

    const decoded = jwt.verify(token, secretKey)

    const user = await database.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [decoded.id])
    if (!user.rows[0]) {
      console.warn(`⚠️ User not found for token decoded id: ${decoded.id}`)
      return next(new ErrorHandler('User not found. Please login again.', 401))
    }

    req.user = user.rows[0]
    console.log(
      `✅ User authenticated: ${user.rows[0].name} (ID: ${user.rows[0].id}) from ${tokenSource}`,
    )
    next()
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      const tokenPreview = token ? token.substring(0, 50) : 'null'
      const isDef = token === 'undefined' ? ' ⚠️ TOKEN IS LITERAL "undefined" STRING!' : ''
      console.error('❌ JWT Verification Error:', error.message)
      console.error('   Token source:', tokenSource)
      console.error('   Token length:', token ? token.length : 0)
      console.error('   Token preview:', tokenPreview + isDef)
      console.error('   Expected: JWT format (header.payload.signature)')
      console.error('   Actual:', token || 'missing')
      return next(new ErrorHandler('Invalid token. Please login again.', 401))
    } else if (error.name === 'TokenExpiredError') {
      console.error('⏰ JWT Expired at:', error.expiredAt)
      console.error('   Token source:', tokenSource)
      return next(new ErrorHandler('Token expired. Please login again.', 401))
    }
    console.error('❌ Authentication error:', error.message)
    console.error('   Token source:', tokenSource)
    return next(new ErrorHandler('Authentication failed. Please login again.', 401))
  }
})

export const authorizedRoles = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new ErrorHandler(`Role: ${req.user.role} is not allowed to access this resource.`, 403),
      )
    }
    next()
  }
}
