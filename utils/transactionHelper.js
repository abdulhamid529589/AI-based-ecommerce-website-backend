/**
 * Database Transaction Helper
 * Manages transaction lifecycle with proper error handling
 */

import database from '../database/db.js'

class TransactionHelper {
  constructor() {
    this.client = null
  }

  /**
   * Begin a transaction
   */
  async begin() {
    try {
      this.client = await database.connect()
      await this.client.query('BEGIN')
      return this.client
    } catch (error) {
      if (this.client) {
        this.client.release()
      }
      throw new Error(`Failed to begin transaction: ${error.message}`)
    }
  }

  /**
   * Commit transaction
   */
  async commit() {
    try {
      if (!this.client) {
        throw new Error('No active transaction to commit')
      }

      await this.client.query('COMMIT')
      this.client.release()
      this.client = null
      return true
    } catch (error) {
      throw new Error(`Failed to commit transaction: ${error.message}`)
    }
  }

  /**
   * Rollback transaction
   */
  async rollback() {
    try {
      if (!this.client) {
        return false
      }

      await this.client.query('ROLLBACK')
      this.client.release()
      this.client = null
      return true
    } catch (error) {
      console.error('Failed to rollback transaction:', error.message)
      if (this.client) {
        this.client.release()
      }
      this.client = null
      return false
    }
  }

  /**
   * Execute query within transaction
   */
  async query(queryString, params = []) {
    try {
      if (!this.client) {
        throw new Error('No active transaction')
      }

      const result = await this.client.query(queryString, params)
      return result
    } catch (error) {
      // Auto-rollback on query error
      await this.rollback()
      throw error
    }
  }

  /**
   * Execute multiple queries atomically
   */
  async executeAtomic(queries) {
    const transaction = new TransactionHelper()

    try {
      await transaction.begin()

      const results = []
      for (const { query: queryString, params = [] } of queries) {
        const result = await transaction.query(queryString, params)
        results.push(result)
      }

      await transaction.commit()
      return results
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }

  /**
   * Get active client for manual queries
   */
  getClient() {
    return this.client
  }

  /**
   * Check if transaction is active
   */
  isActive() {
    return this.client !== null
  }
}

/**
 * Execute callback within transaction wrapper
 * Automatically commits on success, rolls back on error
 */
export async function withTransaction(callback) {
  const transaction = new TransactionHelper()

  try {
    await transaction.begin()
    const result = await callback(transaction)
    await transaction.commit()
    return result
  } catch (error) {
    await transaction.rollback()
    throw error
  }
}

/**
 * Execute multiple queries atomically
 * Automatically handles commit/rollback
 */
export async function executeAtomic(queries) {
  const transaction = new TransactionHelper()

  try {
    const results = await transaction.executeAtomic(queries)
    return results
  } catch (error) {
    throw error
  }
}

export default TransactionHelper
