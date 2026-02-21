/**
 * 🔑 IDEMPOTENCY KEY UTILITY
 * Manages idempotency keys to prevent duplicate payment processing
 *
 * Features:
 * - Store idempotency keys with request results
 * - Check if key already processed
 * - Return cached result for duplicate requests
 * - Automatic cleanup of old keys
 */

import database from '../database/db.js'

// In-memory cache for fast lookups (also stored in DB for persistence)
const idempotencyCache = new Map()

const IDEMPOTENCY_KEY_TIMEOUT = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Store idempotency key result
 * Prevents duplicate processing if same key submitted again
 */
export const storeIdempotencyKey = async (key, result, status = 'success') => {
  try {
    const expiresAt = new Date(Date.now() + IDEMPOTENCY_KEY_TIMEOUT)

    // Store in database for persistence
    await database.query(
      `INSERT INTO idempotency_keys (key, result, status, expires_at, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (key) DO NOTHING`,
      [key, JSON.stringify(result), status, expiresAt],
    )

    // Cache in memory for faster lookups
    idempotencyCache.set(key, {
      result,
      status,
      timestamp: Date.now(),
    })

    return true
  } catch (error) {
    console.error('❌ Failed to store idempotency key:', error.message)
    return false
  }
}

/**
 * Check if idempotency key was already processed
 * Returns cached result if found, null if not found or expired
 */
export const getIdempotencyKeyResult = async (key) => {
  try {
    // Check memory cache first (faster)
    if (idempotencyCache.has(key)) {
      const cached = idempotencyCache.get(key)
      // Check if cache is still valid
      if (Date.now() - cached.timestamp < IDEMPOTENCY_KEY_TIMEOUT) {
        console.log(`✅ Idempotency key found in cache: ${key}`)
        return {
          result: cached.result,
          status: cached.status,
          source: 'cache',
        }
      } else {
        idempotencyCache.delete(key)
      }
    }

    // Check database if not in cache
    const result = await database.query(
      `SELECT result, status FROM idempotency_keys
       WHERE key = $1 AND expires_at > NOW()`,
      [key],
    )

    if (result.rows.length > 0) {
      const row = result.rows[0]
      console.log(`✅ Idempotency key found in database: ${key}`)
      return {
        result: JSON.parse(row.result),
        status: row.status,
        source: 'database',
      }
    }

    return null
  } catch (error) {
    console.error('❌ Error checking idempotency key:', error.message)
    return null
  }
}

/**
 * Clean up expired idempotency keys
 * Run periodically to keep database clean
 */
export const cleanupExpiredIdempotencyKeys = async () => {
  try {
    const result = await database.query(`DELETE FROM idempotency_keys WHERE expires_at < NOW()`)
    console.log(`🧹 Cleaned up ${result.rowCount} expired idempotency keys`)
  } catch (error) {
    console.error('❌ Error cleaning idempotency keys:', error.message)
  }
}

/**
 * Initialize cleanup routine
 * Runs every hour
 */
export const initializeIdempotencyCleanup = () => {
  setInterval(
    () => {
      cleanupExpiredIdempotencyKeys()
    },
    60 * 60 * 1000,
  ) // Every hour

  console.log('⏱️ Idempotency key cleanup routine initialized')
}

export default {
  storeIdempotencyKey,
  getIdempotencyKeyResult,
  cleanupExpiredIdempotencyKeys,
  initializeIdempotencyCleanup,
}
