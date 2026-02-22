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

  // DEBUG: Log token sources for ALL protected endpoints in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`🔐 [AUTH] ${req.method} ${req.path}`, {
      tokenSource,
      hasToken: !!token,
      tokenLength: token ? token.length : 0,
      cookies: Object.keys(req.cookies || {}),
      authHeader: req.headers.authorization ? 'present' : 'missing',
    })
  }

  // ✅ CRITICAL FIX: Check for literal 'undefined' string in token
  if (!token || token === 'undefined' || token === null) {
    console.warn(`❌ [AUTH] No token found for ${req.method} ${req.path}`)
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
    console.log(`   JWT Decoded ID: ${decoded.id}`)

    // DEBUG: Compare JWT role vs database role for order/admin requests
    if (req.path.includes('/order/admin')) {
      console.log(`   🔐 JWT ROLE CHECK for order/admin:`, {
        roleInToken: decoded.role,
        tokenVerified: true,
      })
    }

    const user = await database.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [decoded.id])
    if (!user.rows[0]) {
      console.warn(`⚠️ User not found for token decoded id: ${decoded.id}`)
      console.warn(`   Database query returned ${user.rows.length} rows`)
      return next(new ErrorHandler('User not found. Please login again.', 401))
    }

    req.user = user.rows[0]
    // 🔍 DEBUG: Log all user columns for troubleshooting
    console.log(
      `✅ User authenticated: ${user.rows[0].name} (ID: ${user.rows[0].id}) from ${tokenSource}`,
    )
    console.log(`   User object keys: ${Object.keys(user.rows[0]).join(', ')}`)
    console.log(`   User role value: "${user.rows[0].role}" (type: ${typeof user.rows[0].role})`)

    // DEBUG: Show role mismatch if it exists
    if (req.path.includes('/order/admin') && decoded.role !== user.rows[0].role) {
      console.log(`   ⚠️ ROLE MISMATCH DETECTED:`, {
        roleInJWT: decoded.role,
        roleInDB: user.rows[0].role,
      })
    }

    console.log(`   Full user data:`, {
      id: user.rows[0].id,
      name: user.rows[0].name,
      email: user.rows[0].email ? '***' : 'null',
      mobile: user.rows[0].mobile ? '***' : 'null',
      role: user.rows[0].role,
      created_at: user.rows[0].created_at,
    })
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
    // 🔍 DEBUG: Log role information for troubleshooting
    console.log(
      `🔑 Role Check - User: ${req.user?.name}, Role: "${req.user?.role}", Type: ${typeof req.user?.role}, Allowed: [${roles.join(', ')}]`,
    )

    if (!roles.includes(req.user.role)) {
      console.error(
        `❌ Authorization Failed: Role "${req.user.role}" not in allowed roles [${roles.join(', ')}]`,
      )
      return next(
        new ErrorHandler(`Role: ${req.user.role} is not allowed to access this resource.`, 403),
      )
    }
    next()
  }
}
