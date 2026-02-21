/**
 * 🔧 ENHANCED ASYNC ERROR HANDLING
 *
 * Features:
 * - Improved catchAsyncErrors wrapper
 * - Retry logic for transient failures
 * - Circuit breaker pattern for external services
 * - Timeout handling
 * - Graceful degradation
 */

import { logError, logPaymentError } from './sentryIntegration.js'

/**
 * Enhanced version of catchAsyncErrors
 * Wraps async route handlers and passes errors to middleware
 */
export const catchAsyncErrors = (fn) => {
  return async (req, res, next) => {
    try {
      await fn(req, res, next)
    } catch (error) {
      // Log error details
      if (process.env.NODE_ENV === 'development') {
        console.error('⚠️ Async Error Caught:', {
          message: error.message,
          stack: error.stack,
          path: req.path,
          method: req.method,
        })
      }

      // Log to Sentry
      logError(error, {
        type: 'async_handler_error',
        tags: {
          path: req.path,
          method: req.method,
          handler: fn.name,
        },
        extra: {
          query: req.query,
          params: req.params,
        },
      })

      // Pass to error middleware
      next(error)
    }
  }
}

/**
 * Retry utility with exponential backoff
 * Useful for external API calls that might fail temporarily
 *
 * Usage:
 * const result = await retryWithBackoff(() => axios.post(...), {
 *   maxRetries: 3,
 *   initialDelay: 1000,
 *   backoffMultiplier: 2
 * })
 */
export const retryWithBackoff = async (fn, options = {}) => {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    backoffMultiplier = 2,
    timeout = 30000,
    onRetry = null,
  } = options

  let lastError
  let delay = initialDelay

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Execute function with timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), timeout),
      )

      const result = await Promise.race([fn(), timeoutPromise])
      return result
    } catch (error) {
      lastError = error

      if (attempt === maxRetries) {
        console.error(`❌ Failed after ${maxRetries} attempts:`, error.message)
        break
      }

      console.warn(`⚠️ Attempt ${attempt} failed, retrying in ${delay}ms...`, error.message)

      if (onRetry) {
        onRetry(attempt, error, delay)
      }

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, delay))

      // Increase delay for next retry
      delay *= backoffMultiplier
    }
  }

  throw lastError
}

/**
 * Circuit breaker pattern
 * Prevents cascading failures by failing fast if service is down
 */
export class CircuitBreaker {
  constructor(fn, options = {}) {
    this.fn = fn
    this.state = 'CLOSED' // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0
    this.failureThreshold = options.failureThreshold || 5
    this.resetTimeout = options.resetTimeout || 60000 // 1 minute
    this.lastFailureTime = null
    this.successCallback = options.onSuccess || null
    this.failureCallback = options.onFailure || null
  }

  async execute(...args) {
    // Check if we should attempt reset
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        console.log('🔄 Circuit breaker attempting reset (HALF_OPEN state)')
        this.state = 'HALF_OPEN'
      } else {
        throw new Error(
          `Circuit breaker OPEN. Service unavailable. Retry after ${this.resetTimeout}ms`,
        )
      }
    }

    try {
      const result = await this.fn(...args)

      // Success - reset on successful call
      if (this.state !== 'CLOSED') {
        console.log('✅ Circuit breaker reset (CLOSED state)')
        this.state = 'CLOSED'
        this.failureCount = 0
      }

      if (this.successCallback) {
        this.successCallback(result)
      }

      return result
    } catch (error) {
      this.failureCount++
      this.lastFailureTime = Date.now()

      console.error(
        `❌ Circuit breaker failure (${this.failureCount}/${this.failureThreshold}):`,
        error.message,
      )

      if (this.failureCount >= this.failureThreshold) {
        this.state = 'OPEN'
        console.error('🔴 Circuit breaker OPEN - failing fast')
      }

      if (this.failureCallback) {
        this.failureCallback(error, this.failureCount)
      }

      throw error
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
    }
  }

  reset() {
    this.state = 'CLOSED'
    this.failureCount = 0
    this.lastFailureTime = null
    console.log('🔄 Circuit breaker manually reset')
  }
}

/**
 * Wrapper for payment operations with enhanced error handling
 * Includes retry logic and error tracking
 */
export const executePaymentOperation = async (operation, context = {}, options = {}) => {
  const { maxRetries = 2, timeout = 30000, description = 'Payment operation' } = options

  try {
    console.log(`💳 ${description}:`, {
      orderId: context.orderId,
      gateway: context.gateway,
    })

    const result = await retryWithBackoff(operation, {
      maxRetries,
      timeout,
      initialDelay: 500,
      backoffMultiplier: 2,
      onRetry: (attempt, error, delay) => {
        logPaymentError(error, {
          orderId: context.orderId,
          gateway: context.gateway,
          attemptNumber: attempt,
          nextRetryIn: delay,
        })
      },
    })

    console.log(`✅ ${description} succeeded`, {
      orderId: context.orderId,
    })

    return result
  } catch (error) {
    console.error(`❌ ${description} failed:`, error.message)

    logPaymentError(error, {
      orderId: context.orderId,
      gateway: context.gateway,
      amount: context.amount,
      userId: context.userId,
    })

    throw error
  }
}

/**
 * Timeout wrapper for promises
 * Rejects if promise doesn't resolve within timeout
 */
export const withTimeout = (promise, timeout = 30000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Operation timeout')), timeout)),
  ])
}

/**
 * Safe execution wrapper
 * Ensures errors don't crash the application
 */
export const safeExecute = async (fn, fallback = null) => {
  try {
    return await fn()
  } catch (error) {
    console.error('❌ Safe execution error:', error.message)
    logError(error, {
      type: 'safe_execute',
      tags: { hasFallback: !!fallback },
    })
    return fallback
  }
}

/**
 * Parallel execution with error handling
 * Executes multiple operations in parallel, handles individual failures
 */
export const executeParallel = async (operations, stopOnFirstError = false) => {
  const results = []
  const errors = []

  const promises = operations.map(async (op, index) => {
    try {
      const result = await op.fn()
      results[index] = {
        success: true,
        data: result,
        operation: op.name,
      }
    } catch (error) {
      const errorObj = {
        success: false,
        error: error.message,
        operation: op.name,
      }
      errors.push(errorObj)
      results[index] = errorObj

      if (stopOnFirstError) {
        throw error
      }
    }
  })

  if (stopOnFirstError) {
    await Promise.all(promises)
  } else {
    await Promise.allSettled(promises)
  }

  return {
    results,
    errors,
    hasErrors: errors.length > 0,
    successCount: results.filter((r) => r.success).length,
  }
}

export default {
  catchAsyncErrors,
  retryWithBackoff,
  CircuitBreaker,
  executePaymentOperation,
  withTimeout,
  safeExecute,
  executeParallel,
}
