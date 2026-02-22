/**
 * SERVER PERFORMANCE OPTIMIZATION UTILITIES
 * Implements caching, query optimization, and monitoring
 */

import database from '../database/db.js'

/**
 * Create optimized database indexes for common queries
 * Run this once during server setup to improve query performance
 */
export const createPerformanceIndexes = async () => {
  try {
    console.log('🚀 Creating performance indexes...')

    const indexes = [
      // Products table indexes
      {
        name: 'idx_products_category',
        query: `CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);`,
      },
      {
        name: 'idx_products_price',
        query: `CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);`,
      },
      {
        name: 'idx_products_stock',
        query: `CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock);`,
      },
      {
        name: 'idx_products_rating',
        query: `CREATE INDEX IF NOT EXISTS idx_products_rating ON products(ratings);`,
      },
      {
        name: 'idx_products_created',
        query: `CREATE INDEX IF NOT EXISTS idx_products_created ON products(created_at DESC);`,
      },

      // Reviews table indexes
      {
        name: 'idx_reviews_product_id',
        query: `CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);`,
      },
      {
        name: 'idx_reviews_user_id',
        query: `CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);`,
      },

      // Orders table indexes
      {
        name: 'idx_orders_user_id',
        query: `CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);`,
      },
      {
        name: 'idx_orders_status',
        query: `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status);`,
      },
      {
        name: 'idx_orders_created',
        query: `CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);`,
      },

      // Cart items indexes
      {
        name: 'idx_cart_user_id',
        query: `CREATE INDEX IF NOT EXISTS idx_cart_user_id ON cart_items(user_id);`,
      },
      {
        name: 'idx_cart_product_id',
        query: `CREATE INDEX IF NOT EXISTS idx_cart_product_id ON cart_items(product_id);`,
      },

      // Wishlist indexes
      {
        name: 'idx_wishlist_user_product',
        query: `CREATE INDEX IF NOT EXISTS idx_wishlist_user_product ON wishlist(user_id, product_id);`,
      },

      // Users table indexes
      {
        name: 'idx_users_email',
        query: `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`,
      },

      // Featured products indexes
      {
        name: 'idx_featured_products_active',
        query: `CREATE INDEX IF NOT EXISTS idx_featured_products_active ON featured_products(is_active);`,
      },
    ]

    for (const index of indexes) {
      try {
        await database.query(index.query)
        console.log(`✅ Index created: ${index.name}`)
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`⏭️  Index already exists: ${index.name}`)
        } else {
          console.error(`❌ Failed to create index ${index.name}:`, error.message)
        }
      }
    }

    console.log('✅ All performance indexes created successfully!')
  } catch (error) {
    console.error('❌ Error creating performance indexes:', error)
  }
}

/**
 * Simple in-memory cache with TTL
 */
export class CacheManager {
  constructor() {
    this.cache = new Map()
    this.ttl = new Map()
  }

  set(key, value, ttlSeconds = 300) {
    this.cache.set(key, value)
    const expiryTime = Date.now() + ttlSeconds * 1000

    // Clear existing timeout
    if (this.ttl.has(key)) {
      clearTimeout(this.ttl.get(key))
    }

    // Set new timeout
    const timeoutId = setTimeout(() => {
      this.cache.delete(key)
      this.ttl.delete(key)
    }, ttlSeconds * 1000)

    this.ttl.set(key, timeoutId)
  }

  get(key) {
    return this.cache.get(key) || null
  }

  has(key) {
    return this.cache.has(key)
  }

  delete(key) {
    if (this.ttl.has(key)) {
      clearTimeout(this.ttl.get(key))
      this.ttl.delete(key)
    }
    this.cache.delete(key)
  }

  clear() {
    for (const timeoutId of this.ttl.values()) {
      clearTimeout(timeoutId)
    }
    this.cache.clear()
    this.ttl.clear()
  }

  size() {
    return this.cache.size
  }
}

// Global cache instance
export const globalCache = new CacheManager()

/**
 * Cache key generator for consistent cache keys
 */
export const generateCacheKey = (prefix, params = {}) => {
  const paramStr = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&')
  return `${prefix}:${paramStr}`
}

/**
 * Performance monitoring wrapper
 */
export const measurePerformance = async (operation, fn, operationName = '') => {
  const startTime = process.hrtime.bigint()

  try {
    const result = await fn()
    const endTime = process.hrtime.bigint()
    const duration = Number(endTime - startTime) / 1000000 // Convert to ms

    console.log(`⏱️  ${operationName || operation}: ${duration.toFixed(2)}ms`)

    return result
  } catch (error) {
    const endTime = process.hrtime.bigint()
    const duration = Number(endTime - startTime) / 1000000
    console.error(`❌ ${operationName || operation} (${duration.toFixed(2)}ms):`, error.message)
    throw error
  }
}

/**
 * Database connection pooling status checker
 */
export const getDbPoolStatus = async (pool) => {
  return {
    idleCount: pool.idleCount,
    totalCount: pool.totalCount,
    waitingCount: pool.waitingCount,
    timestamp: new Date(),
  }
}

/**
 * Query result pagination helper
 */
export const paginateResults = (total, limit, page) => {
  const totalPages = Math.ceil(total / limit)
  return {
    total,
    limit,
    page,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  }
}

export default {
  createPerformanceIndexes,
  CacheManager,
  globalCache,
  generateCacheKey,
  measurePerformance,
  getDbPoolStatus,
  paginateResults,
}
