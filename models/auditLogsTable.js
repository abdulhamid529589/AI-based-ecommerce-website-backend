/**
 * 🔒 Audit Logs Table Schema
 * Stores all security-relevant actions for monitoring and compliance
 */

import database from '../database/db.js'

export const createAuditLogsTable = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,

      -- User who performed the action (nullable for unauthenticated actions)
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,

      -- Action type (LOGIN, CREATE_PRODUCT, UPDATE_ORDER, PAYMENT_SUCCESS, etc)
      action VARCHAR(50) NOT NULL,

      -- Type of resource affected (user, product, order, payment, security, input)
      resource_type VARCHAR(50) NOT NULL,

      -- ID of the affected resource
      resource_id VARCHAR(255) NOT NULL,

      -- Action status (SUCCESS, FAILURE, BLOCKED)
      status VARCHAR(20) NOT NULL CHECK (status IN ('SUCCESS', 'FAILURE', 'BLOCKED')),

      -- Additional details stored as JSON
      -- Examples:
      -- {"amount": 5000, "gateway": "Stripe"}
      -- {"reason": "INVALID_PASSWORD", "timestamp": "2024-01-01T12:00:00Z"}
      -- {"field": "phone", "reason": "Invalid format"}
      details JSONB DEFAULT '{}',

      -- IP address of the request (for suspicious activity tracking)
      ip_address INET,

      -- When the action occurred
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `

  try {
    await database.query(createTableQuery)
    console.log('✅ audit_logs table created successfully')

    // Create indexes for common queries
    const indexQueries = [
      // Index for finding user's recent actions
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id_timestamp
       ON audit_logs(user_id, timestamp DESC)`,

      // Index for finding specific action types
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_action
       ON audit_logs(action, timestamp DESC)`,

      // Index for security monitoring (blocked/failed actions)
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_status
       ON audit_logs(status, timestamp DESC)`,

      // Index for resource tracking
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_resource
       ON audit_logs(resource_type, resource_id, timestamp DESC)`,

      // Index for IP address tracking (detect coordinated attacks)
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address
       ON audit_logs(ip_address, timestamp DESC)`,

      // Index for finding failed logins from IP
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_login_attempts
       ON audit_logs(action, ip_address, timestamp DESC)
       WHERE action = 'LOGIN_FAILED'`,

      // Index for security events
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_security_events
       ON audit_logs(resource_type, timestamp DESC)
       WHERE resource_type = 'security'`,
    ]

    for (const indexQuery of indexQueries) {
      try {
        await database.query(indexQuery)
      } catch (error) {
        // Index might already exist, that's okay
        if (!error.message.includes('already exists')) {
          console.warn('⚠️ Index creation warning:', error.message)
        }
      }
    }

    console.log('✅ All audit log indexes created successfully')
  } catch (error) {
    console.error('❌ Error creating audit_logs table:', error.message)
    throw error
  }
}

export default createAuditLogsTable
