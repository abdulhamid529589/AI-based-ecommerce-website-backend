import jwt from 'jsonwebtoken'
import { sanitizeUser } from './sanitizeUser.js'

const isProduction = process.env.NODE_ENV === 'production'

/** Cross-origin SPAs need None+Secure; same-site deploys can keep Lax/Strict via env. */
const cookieSameSite = process.env.COOKIE_SAME_SITE || (isProduction ? 'None' : 'Lax')

export const sendToken = (user, statusCode, message, res) => {
  const secretKeyAccess = process.env.JWT_SECRET_KEY_ACCESS || process.env.JWT_SECRET_KEY
  const secretKeyRefresh = process.env.JWT_SECRET_KEY_REFRESH || process.env.JWT_SECRET_KEY

  if (!secretKeyAccess || !secretKeyRefresh) {
    console.error('❌ CRITICAL: JWT_SECRET_KEY environment variables not configured!')
    console.error('   JWT_SECRET_KEY_ACCESS:', secretKeyAccess ? '✓' : '✗ MISSING')
    console.error('   JWT_SECRET_KEY_REFRESH:', secretKeyRefresh ? '✓' : '✗ MISSING')
    return res.status(500).json({
      success: false,
      message: 'Server configuration error. Please try again later.',
    })
  }

  // Access token - short-lived (15 minutes)
  const accessToken = jwt.sign({ id: user.id }, secretKeyAccess, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m',
  })

  // Refresh token - long-lived (7 days)
  const refreshToken = jwt.sign({ id: user.id }, secretKeyRefresh, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
  })

  // ✅ HIGH FIX: Only log in development to avoid exposing user IDs
  if (process.env.NODE_ENV === 'development') {
    console.log(`✅ Generated tokens for user ID: ${user.id}`)
    console.log(`   Access Token length: ${accessToken.length} chars`)
    console.log(`   Refresh Token length: ${refreshToken.length} chars`)
  }

  res
    .status(statusCode)
    .cookie('token', accessToken, {
      expires: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      httpOnly: true,
      sameSite: cookieSameSite,
      secure: isProduction || cookieSameSite === 'None',
      domain: process.env.COOKIE_DOMAIN || undefined,
      path: '/',
    })
    .cookie('accessToken', accessToken, {
      expires: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      httpOnly: true,
      sameSite: cookieSameSite,
      secure: isProduction || cookieSameSite === 'None',
      domain: process.env.COOKIE_DOMAIN || undefined,
      path: '/',
    })
    .cookie('refreshToken', refreshToken, {
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      httpOnly: true,
      sameSite: cookieSameSite,
      secure: isProduction || cookieSameSite === 'None',
      domain: process.env.COOKIE_DOMAIN || undefined,
      path: '/',
    })
    .json({
      success: true,
      user: sanitizeUser(user),
      message,
      // Access token for SPA Authorization header (short-lived)
      accessToken: accessToken,
      token: accessToken,
      // Refresh token is HttpOnly cookie only — never expose in JSON
    })
}
