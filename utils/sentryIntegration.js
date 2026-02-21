/**
 * 🔍 ERROR TRACKING UTILITY - SENTRY INTEGRATION
 *
 * Features:
 * - Initialize Sentry for error tracking (optional)
 * - Log errors with context
 * - Track payment-related errors separately
 * - User identification for debugging
 * - Environment-specific reporting
 *
 * Note: Sentry is optional. To enable:
 * 1. Install: npm install @sentry/node @sentry/integrations
 * 2. Set SENTRY_DSN in .env file
 */

let Sentry = null
let SentryIntegrations = null
let sentryInitialized = false
let sentryAvailable = false

// Try to load Sentry packages (optional) - deferred to initialization
const loadSentryPackages = async () => {
  if (Sentry !== null) return // Already loaded

  try {
    Sentry = await import('@sentry/node').then((m) => m.default || m)
    SentryIntegrations = await import('@sentry/integrations').then((m) => m.default || m)
    sentryAvailable = true
  } catch (err) {
    // Sentry not installed, continue without it
    console.log('ℹ️ Sentry not installed. Error tracking disabled.')
    console.log('   To enable: npm install @sentry/node @sentry/integrations')
    sentryAvailable = false
  }
}

/**
 * Initialize Sentry error tracking
 * Call this during server startup
 * Returns: true if initialized, false if disabled or not available
 */
export const initializeSentry = async () => {
  // Load Sentry packages first
  await loadSentryPackages()

  if (!sentryAvailable) {
    return false
  }

  const dsn = process.env.SENTRY_DSN

  if (!dsn) {
    return false
  }

  try {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'production',
      tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
      integrations: [
        // Performance monitoring
        new SentryIntegrations.Http({ tracing: true }),
        // Database monitoring
        new SentryIntegrations.OnUncaughtException(),
        new SentryIntegrations.OnUnhandledRejection(),
      ],
      // Ignore certain errors
      ignoreErrors: [
        // Browser extensions
        'top.GLOBALS',
        'originalCreateNotification',
        'canvas.contentDocument',
        'MyApp_RemoveAllHighlights',
        // See http://blog.errorception.com/2012/03/tale-of-unfindable-js-error.html for sneaky debugging in Safari
        "Can't find variable: ZiteReader",
        'jigsaw is not defined',
        'ComboSearch is not defined',
      ],
      denyUrls: [
        // Browser extensions
        /extensions\//i,
        /^chrome:\/\//i,
        /^moz-extension:\/\//i,
      ],
    })

    sentryInitialized = true
    console.log('✅ Sentry error tracking initialized')
    console.log(`   Environment: ${process.env.NODE_ENV}`)
    console.log(`   Traces Sample Rate: ${process.env.NODE_ENV === 'development' ? '100%' : '10%'}`)

    return true
  } catch (error) {
    console.error('❌ Failed to initialize Sentry:', error.message)
    return false
  }
}

/**
 * Log error to Sentry with context
 * Use for general application errors
 */
export const logError = (error, context = {}) => {
  if (!sentryInitialized) {
    console.error('⚠️ Error (Sentry not initialized):', error.message)
    return
  }

  try {
    Sentry.captureException(error, {
      tags: {
        type: context.type || 'general',
        ...context.tags,
      },
      extra: context.extra || {},
    })

    if (process.env.NODE_ENV === 'development') {
      console.error('📍 Error logged to Sentry:', {
        message: error.message,
        context,
      })
    }
  } catch (err) {
    console.error('❌ Failed to log error to Sentry:', err.message)
  }
}

/**
 * Log payment-specific error
 * Use for payment gateway errors, transaction failures, etc.
 */
export const logPaymentError = (error, paymentData = {}) => {
  if (!sentryInitialized) {
    console.error('⚠️ Payment Error (Sentry not initialized):', error.message)
    return
  }

  try {
    Sentry.captureException(error, {
      tags: {
        type: 'payment_error',
        gateway: paymentData.gateway || 'unknown',
        amount: paymentData.amount,
      },
      extra: {
        orderId: paymentData.orderId,
        userId: paymentData.userId,
        paymentMethod: paymentData.paymentMethod,
        // Don't log sensitive data like card numbers
        lastDigits: paymentData.lastDigits,
      },
    })

    if (process.env.NODE_ENV === 'development') {
      console.error('💳 Payment error logged to Sentry:', {
        message: error.message,
        gateway: paymentData.gateway,
        orderId: paymentData.orderId,
      })
    }
  } catch (err) {
    console.error('❌ Failed to log payment error to Sentry:', err.message)
  }
}

/**
 * Set user context for error tracking
 * Call after user authentication
 */
export const setUserContext = (userId, userData = {}) => {
  if (!sentryInitialized) return

  try {
    Sentry.setUser({
      id: userId,
      email: userData.email,
      username: userData.username,
    })

    if (process.env.NODE_ENV === 'development') {
      console.log(`👤 Sentry user context set: ${userData.email}`)
    }
  } catch (error) {
    console.error('❌ Failed to set Sentry user context:', error.message)
  }
}

/**
 * Clear user context on logout
 */
export const clearUserContext = () => {
  if (!sentryInitialized) return

  try {
    Sentry.setUser(null)
    if (process.env.NODE_ENV === 'development') {
      console.log('👤 Sentry user context cleared')
    }
  } catch (error) {
    console.error('❌ Failed to clear Sentry user context:', error.message)
  }
}

/**
 * Log message for debugging
 * Use for important application events
 */
export const logInfo = (message, data = {}) => {
  if (!sentryInitialized) {
    console.log('ℹ️', message, data)
    return
  }

  try {
    Sentry.captureMessage(message, 'info', {
      extra: data,
    })

    if (process.env.NODE_ENV === 'development') {
      console.log(`ℹ️ ${message}`, data)
    }
  } catch (error) {
    console.error('❌ Failed to log message to Sentry:', error.message)
  }
}

/**
 * Middleware for Express to integrate Sentry
 * Add before other middleware
 */
export const sentryErrorMiddleware = (err, req, res, next) => {
  if (!sentryInitialized) {
    return next(err)
  }

  try {
    Sentry.captureException(err, {
      tags: {
        type: 'request_error',
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
      },
      extra: {
        query: req.query,
        // Don't log full body - might contain sensitive data
        method: req.method,
        url: req.url,
      },
    })
  } catch (error) {
    console.error('❌ Failed to capture request error:', error.message)
  }

  next(err)
}

/**
 * Flush Sentry before server shutdown
 * Ensures all events are sent
 */
export const flushSentry = async () => {
  if (!sentryInitialized) return

  try {
    console.log('⏳ Flushing Sentry events before shutdown...')
    await Sentry.close(2000) // Wait max 2 seconds
    console.log('✅ Sentry events flushed')
  } catch (error) {
    console.error('❌ Error flushing Sentry:', error.message)
  }
}

export default {
  initializeSentry,
  logError,
  logPaymentError,
  setUserContext,
  clearUserContext,
  logInfo,
  sentryErrorMiddleware,
  flushSentry,
}
