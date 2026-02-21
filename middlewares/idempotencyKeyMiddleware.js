/**
 * 🔑 IDEMPOTENCY KEY MIDDLEWARE
 * Validates and manages idempotency keys for payment and checkout operations
 */

import { getIdempotencyKeyResult, storeIdempotencyKey } from '../utils/idempotencyKey.js'
import ErrorHandler from './errorMiddleware.js'
import { logPaymentError } from '../utils/sentryIntegration.js'

/**
 * Middleware to check and validate idempotency keys
 * Attach to payment and checkout endpoints
 *
 * Usage: router.post('/payment', idempotencyKeyMiddleware, controller)
 */
export const idempotencyKeyMiddleware = async (req, res, next) => {
  const idempotencyKey = req.headers['idempotency-key']

  // For payment and checkout operations, idempotency key is required
  const isPaymentOperation = req.path.includes('/payment') || req.path.includes('/checkout')

  if (isPaymentOperation && !idempotencyKey) {
    return next(new ErrorHandler('Idempotency-Key header is required for payment operations', 400))
  }

  if (!idempotencyKey) {
    // Not a payment operation - just continue
    return next()
  }

  // Validate idempotency key format (should be UUID or similar)
  const validKeyFormat = /^[a-zA-Z0-9\-]{20,}$/.test(idempotencyKey)
  if (!validKeyFormat) {
    return next(
      new ErrorHandler('Invalid Idempotency-Key format. Must be 20+ alphanumeric characters', 400),
    )
  }

  try {
    // Check if this idempotency key was already processed
    const cachedResult = await getIdempotencyKeyResult(idempotencyKey)

    if (cachedResult) {
      console.log(
        `🔄 Duplicate request detected. Returning cached result for key: ${idempotencyKey}`,
      )

      // Return cached response
      if (cachedResult.status === 'success') {
        return res.status(200).json({
          success: true,
          message: 'Processed (cached result)',
          data: cachedResult.result,
          cached: true,
        })
      } else if (cachedResult.status === 'error') {
        return res.status(400).json({
          success: false,
          message: 'Previous attempt failed (cached)',
          error: cachedResult.result,
          cached: true,
        })
      }
    }

    // Store idempotency key on response
    req.idempotencyKey = idempotencyKey

    // Intercept response to store result
    const originalJson = res.json.bind(res)
    res.json = function (body) {
      // Store successful responses for idempotency
      if (isPaymentOperation && res.statusCode >= 200 && res.statusCode < 300) {
        storeIdempotencyKey(idempotencyKey, body, 'success').catch((err) => {
          console.error('⚠️ Failed to store idempotency key:', err.message)
        })
      }

      return originalJson(body)
    }

    next()
  } catch (error) {
    console.error('❌ Error in idempotency middleware:', error.message)
    logPaymentError(error, {
      type: 'idempotency_middleware_error',
      idempotencyKey,
    })
    // Don't block the request - allow it to proceed
    req.idempotencyKey = idempotencyKey
    next()
  }
}

/**
 * Middleware to extract and validate client-generated idempotency key
 * Generates one if not provided
 */
export const ensureIdempotencyKey = (req, res, next) => {
  let idempotencyKey = req.headers['idempotency-key']

  if (!idempotencyKey) {
    // Generate one if not provided
    const crypto = require('crypto')
    idempotencyKey = crypto.randomUUID()
    req.headers['idempotency-key'] = idempotencyKey
    console.log(`📝 Generated idempotency key: ${idempotencyKey}`)
  }

  req.idempotencyKey = idempotencyKey
  next()
}

export default {
  idempotencyKeyMiddleware,
  ensureIdempotencyKey,
}
