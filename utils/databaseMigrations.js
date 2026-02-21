/**
 * 📊 DATABASE MIGRATION - IDEMPOTENCY KEYS TABLE
 * Run this to initialize the idempotency_keys table for payment processing
 */

export const createIdempotencyKeysTable = async (database) => {
  try {
    await database.query(`
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        id SERIAL PRIMARY KEY,
        key VARCHAR(255) UNIQUE NOT NULL,
        result JSONB NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_key (key),
        INDEX idx_expires_at (expires_at)
      )
    `)

    console.log('✅ Idempotency keys table created/verified')
    return true
  } catch (error) {
    // Table might already exist - that's fine
    if (error.message.includes('already exists')) {
      console.log('✓ Idempotency keys table already exists')
      return true
    }

    console.error('❌ Error creating idempotency keys table:', error.message)
    return false
  }
}

/**
 * 📊 DATABASE MIGRATION - PAYMENT AUDIT TABLE
 * Enhanced tracking for all payment operations
 */
export const createPaymentAuditTable = async (database) => {
  try {
    await database.query(`
      CREATE TABLE IF NOT EXISTS payment_audit (
        id SERIAL PRIMARY KEY,
        order_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255),
        gateway VARCHAR(50) NOT NULL,
        transaction_id VARCHAR(255),
        amount DECIMAL(10, 2) NOT NULL,
        status VARCHAR(50) NOT NULL,
        request_data JSONB,
        response_data JSONB,
        error_message TEXT,
        idempotency_key VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        INDEX idx_order_id (order_id),
        INDEX idx_gateway (gateway),
        INDEX idx_status (status),
        INDEX idx_created_at (created_at)
      )
    `)

    console.log('✅ Payment audit table created/verified')
    return true
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log('✓ Payment audit table already exists')
      return true
    }

    console.error('❌ Error creating payment audit table:', error.message)
    return false
  }
}

/**
 * 📊 DATABASE MIGRATION - ERROR LOGS TABLE
 * For tracking errors that need manual investigation
 */
export const createErrorLogsTable = async (database) => {
  try {
    await database.query(`
      CREATE TABLE IF NOT EXISTS error_logs (
        id SERIAL PRIMARY KEY,
        error_code VARCHAR(50),
        error_message TEXT NOT NULL,
        error_stack TEXT,
        context JSONB,
        severity VARCHAR(20) NOT NULL,
        resolved BOOLEAN DEFAULT FALSE,
        user_id VARCHAR(255),
        path VARCHAR(500),
        method VARCHAR(10),
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_severity (severity),
        INDEX idx_resolved (resolved),
        INDEX idx_created_at (created_at)
      )
    `)

    console.log('✅ Error logs table created/verified')
    return true
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log('✓ Error logs table already exists')
      return true
    }

    console.error('❌ Error creating error logs table:', error.message)
    return false
  }
}

export default {
  createIdempotencyKeysTable,
  createPaymentAuditTable,
  createErrorLogsTable,
}
