/**
 * 🔒 Audit Logging Utility
 * Tracks all critical operations for security monitoring and compliance
 *
 * CRITICAL: Must log:
 * - Admin modifications (product/user/order changes)
 * - Failed security checks (failed logins, CSRF, rate limiting)
 * - Payment operations
 * - Sensitive operations (refunds, cancellations)
 */

import database from '../database/db.js'

/**
 * 🔒 Log action to audit trail
 * @param {string} userId - User who performed the action
 * @param {string} action - Action type (LOGIN, CREATE_PRODUCT, UPDATE_ORDER, etc)
 * @param {string} resourceType - Type of resource affected (user, product, order, etc)
 * @param {string} resourceId - ID of affected resource
 * @param {string} status - Action status (SUCCESS, FAILURE, BLOCKED)
 * @param {object} details - Additional details
 * @param {string} ipAddress - IP address of request
 * @returns {Promise<void>}
 */
export const logAuditAction = async (
  userId,
  action,
  resourceType,
  resourceId,
  status,
  details = {},
  ipAddress = null,
) => {
  try {
    const timestamp = new Date()

    const insertQuery = `
      INSERT INTO audit_logs (
        user_id,
        action,
        resource_type,
        resource_id,
        status,
        details,
        ip_address,
        timestamp
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `

    const values = [
      userId || null, // Allow null for unauthenticated actions
      action,
      resourceType,
      resourceId,
      status,
      JSON.stringify(details), // Store details as JSON
      ipAddress,
      timestamp,
    ]

    const result = await database.query(insertQuery, values)
    console.log(`✅ Audit logged: ${action} on ${resourceType}:${resourceId} - ${status}`)
    return result.rows[0]
  } catch (error) {
    // If audit logging fails, log to console but don't crash the application
    console.error('❌ Audit logging failed:', error.message)
  }
}

/**
 * 🔒 Log successful login
 * @param {string} userId - User ID who logged in
 * @param {string} ipAddress - IP address of login
 * @param {string} device - Device/browser information
 */
export const logSuccessfulLogin = async (userId, ipAddress, device = null) => {
  await logAuditAction(
    userId,
    'LOGIN_SUCCESS',
    'user',
    userId,
    'SUCCESS',
    { device, timestamp: new Date() },
    ipAddress,
  )
}

/**
 * 🔒 Log failed login attempt
 * @param {string} email - Email that failed to login
 * @param {string} ipAddress - IP address of attempt
 * @param {string} reason - Reason for failure (INVALID_PASSWORD, USER_NOT_FOUND, etc)
 */
export const logFailedLogin = async (email, ipAddress, reason = 'INVALID_CREDENTIALS') => {
  await logAuditAction(
    null, // No user ID for failed login
    'LOGIN_FAILED',
    'user',
    email,
    'FAILURE',
    { reason, timestamp: new Date() },
    ipAddress,
  )
}

/**
 * 🔒 Log CSRF token validation failure
 * @param {string} userId - User ID (if authenticated)
 * @param {string} ipAddress - IP address
 * @param {string} endpoint - API endpoint attempted
 */
export const logCsrfFailure = async (userId, ipAddress, endpoint) => {
  await logAuditAction(
    userId || null,
    'CSRF_VALIDATION_FAILED',
    'security',
    endpoint,
    'BLOCKED',
    { endpoint, timestamp: new Date() },
    ipAddress,
  )
}

/**
 * 🔒 Log rate limit exceeded
 * @param {string} userId - User ID (if authenticated)
 * @param {string} ipAddress - IP address
 * @param {string} endpoint - API endpoint
 * @param {string} limitType - Type of limit (ORDER, PAYMENT, etc)
 */
export const logRateLimitExceeded = async (userId, ipAddress, endpoint, limitType) => {
  await logAuditAction(
    userId || null,
    'RATE_LIMIT_EXCEEDED',
    'security',
    endpoint,
    'BLOCKED',
    { limitType, endpoint, timestamp: new Date() },
    ipAddress,
  )
}

/**
 * 🔒 Log order creation
 * @param {string} userId - User ID who created order
 * @param {string} orderId - Order ID
 * @param {number} amount - Order amount
 * @param {string} paymentMethod - Payment method
 * @param {string} status - Order status (SUCCESS, FAILED, CANCELLED)
 */
export const logOrderCreation = async (
  userId,
  orderId,
  amount,
  paymentMethod,
  status = 'SUCCESS',
) => {
  await logAuditAction(userId, 'CREATE_ORDER', 'order', orderId, status, {
    amount,
    paymentMethod,
    timestamp: new Date(),
  })
}

/**
 * 🔒 Log order modification
 * @param {string} userId - Admin/user ID making change
 * @param {string} orderId - Order ID
 * @param {string} changes - Description of changes
 */
export const logOrderModification = async (userId, orderId, changes) => {
  await logAuditAction(userId, 'MODIFY_ORDER', 'order', orderId, 'SUCCESS', {
    changes,
    timestamp: new Date(),
  })
}

/**
 * 🔒 Log order cancellation
 * @param {string} userId - User ID cancelling order
 * @param {string} orderId - Order ID
 * @param {string} reason - Cancellation reason
 */
export const logOrderCancellation = async (userId, orderId, reason = 'USER_REQUESTED') => {
  await logAuditAction(userId, 'CANCEL_ORDER', 'order', orderId, 'SUCCESS', {
    reason,
    timestamp: new Date(),
  })
}

/**
 * 🔒 Log payment processing
 * @param {string} userId - User ID making payment
 * @param {string} orderId - Order ID
 * @param {number} amount - Payment amount
 * @param {string} gateway - Payment gateway (Stripe, Bkash, Nagad)
 * @param {string} status - Payment status (SUCCESS, FAILED, PENDING)
 */
export const logPaymentProcessing = async (
  userId,
  orderId,
  amount,
  gateway,
  status = 'SUCCESS',
) => {
  await logAuditAction(
    userId,
    `PAYMENT_${status}`,
    'payment',
    orderId,
    status === 'SUCCESS' ? 'SUCCESS' : 'FAILURE',
    { orderId, amount, gateway, timestamp: new Date() },
  )
}

/**
 * 🔒 Log admin product creation
 * @param {string} adminId - Admin user ID
 * @param {string} productId - Product ID
 * @param {string} productName - Product name
 */
export const logProductCreation = async (adminId, productId, productName) => {
  await logAuditAction(adminId, 'CREATE_PRODUCT', 'product', productId, 'SUCCESS', {
    productName,
    timestamp: new Date(),
  })
}

/**
 * 🔒 Log admin product modification
 * @param {string} adminId - Admin user ID
 * @param {string} productId - Product ID
 * @param {object} changes - Object with changed fields
 */
export const logProductModification = async (adminId, productId, changes = {}) => {
  await logAuditAction(adminId, 'UPDATE_PRODUCT', 'product', productId, 'SUCCESS', {
    changes,
    timestamp: new Date(),
  })
}

/**
 * 🔒 Log admin product deletion
 * @param {string} adminId - Admin user ID
 * @param {string} productId - Product ID
 * @param {string} productName - Product name
 */
export const logProductDeletion = async (adminId, productId, productName) => {
  await logAuditAction(adminId, 'DELETE_PRODUCT', 'product', productId, 'SUCCESS', {
    productName,
    timestamp: new Date(),
  })
}

/**
 * 🔒 Log input validation failure
 * @param {string} userId - User ID (if authenticated)
 * @param {string} ipAddress - IP address
 * @param {string} field - Field that failed validation
 * @param {string} reason - Validation failure reason
 */
export const logValidationFailure = async (userId, ipAddress, field, reason) => {
  await logAuditAction(
    userId || null,
    'VALIDATION_FAILURE',
    'input',
    field,
    'BLOCKED',
    { field, reason, timestamp: new Date() },
    ipAddress,
  )
}

/**
 * 🔒 Retrieve audit logs with filtering
 * @param {object} filters - Filter criteria
 * @param {number} limit - Maximum results
 * @param {number} offset - Pagination offset
 */
export const getAuditLogs = async (filters = {}, limit = 50, offset = 0) => {
  try {
    let query = 'SELECT * FROM audit_logs WHERE 1=1'
    const values = []
    let paramCount = 1

    // Add filters
    if (filters.userId) {
      query += ` AND user_id = $${paramCount}`
      values.push(filters.userId)
      paramCount++
    }

    if (filters.action) {
      query += ` AND action = $${paramCount}`
      values.push(filters.action)
      paramCount++
    }

    if (filters.resourceType) {
      query += ` AND resource_type = $${paramCount}`
      values.push(filters.resourceType)
      paramCount++
    }

    if (filters.status) {
      query += ` AND status = $${paramCount}`
      values.push(filters.status)
      paramCount++
    }

    if (filters.startDate) {
      query += ` AND timestamp >= $${paramCount}`
      values.push(filters.startDate)
      paramCount++
    }

    if (filters.endDate) {
      query += ` AND timestamp <= $${paramCount}`
      values.push(filters.endDate)
      paramCount++
    }

    // Order by newest first, with pagination
    query += ` ORDER BY timestamp DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`
    values.push(limit, offset)

    const result = await database.query(query, values)
    return result.rows
  } catch (error) {
    console.error('Error retrieving audit logs:', error.message)
    return []
  }
}

export default {
  logAuditAction,
  logSuccessfulLogin,
  logFailedLogin,
  logCsrfFailure,
  logRateLimitExceeded,
  logOrderCreation,
  logOrderModification,
  logOrderCancellation,
  logPaymentProcessing,
  logProductCreation,
  logProductModification,
  logProductDeletion,
  logValidationFailure,
  getAuditLogs,
}
