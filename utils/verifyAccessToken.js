import jwt from 'jsonwebtoken'

/**
 * Verify a Bearer access token from Authorization header.
 * Returns decoded payload { id, iat, exp } or null.
 */
export function verifyBearerToken(authHeader) {
  if (!authHeader || !String(authHeader).startsWith('Bearer ')) {
    return null
  }

  const token = String(authHeader).slice(7).trim()
  if (!token || token === 'undefined' || token === 'null') {
    return null
  }

  try {
    return jwt.verify(token, process.env.JWT_SECRET_KEY_ACCESS || process.env.JWT_SECRET_KEY)
  } catch {
    return null
  }
}

/**
 * Verify token from socket handshake (auth.token or Authorization header).
 */
export function verifySocketToken(handshake) {
  const token =
    handshake?.auth?.token ||
    handshake?.headers?.authorization?.replace(/^Bearer\s+/i, '') ||
    null

  if (!token) return null

  try {
    return jwt.verify(token, process.env.JWT_SECRET_KEY_ACCESS || process.env.JWT_SECRET_KEY)
  } catch {
    return null
  }
}

export default verifyBearerToken
