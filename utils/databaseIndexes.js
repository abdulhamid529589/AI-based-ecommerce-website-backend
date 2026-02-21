/**
 * Database Indexes Migration
 * Creates indexes on frequently queried columns for performance optimization
 */

import database from '../database/db.js'

export const createDatabaseIndexes = async () => {
  console.log('\n📊 Creating database indexes for optimization...\n')

  const indexes = [
    {
      name: 'idx_orders_buyer_created',
      query: `CREATE INDEX IF NOT EXISTS idx_orders_buyer_created
              ON orders(buyer_id, created_at DESC)`,
      purpose: 'Fast customer order history retrieval',
    },
    {
      name: 'idx_orders_status_created',
      query: `CREATE INDEX IF NOT EXISTS idx_orders_status_created
              ON orders(order_status, created_at DESC)`,
      purpose: 'Fast order status filtering',
    },
    {
      name: 'idx_products_category_ratings',
      query: `CREATE INDEX IF NOT EXISTS idx_products_category_ratings
              ON products(category, ratings DESC)`,
      purpose: 'Fast product browsing by category and rating',
    },
    {
      name: 'idx_users_email',
      query: `CREATE INDEX IF NOT EXISTS idx_users_email
              ON users(email)`,
      purpose: 'Fast user lookup by email',
    },
    {
      name: 'idx_reviews_product_rating',
      query: `CREATE INDEX IF NOT EXISTS idx_reviews_product_rating
              ON reviews(product_id, rating DESC)`,
      purpose: 'Fast review retrieval by product',
    },
    {
      name: 'idx_wishlist_user_product',
      query: `CREATE INDEX IF NOT EXISTS idx_wishlist_user_product
              ON wishlist_items(user_id, product_id)`,
      purpose: 'Fast wishlist lookup',
    },
    {
      name: 'idx_order_items_order_product',
      query: `CREATE INDEX IF NOT EXISTS idx_order_items_order_product
              ON order_items(order_id, product_id)`,
      purpose: 'Fast order items retrieval',
    },
    {
      name: 'idx_shipping_info_order',
      query: `CREATE INDEX IF NOT EXISTS idx_shipping_info_order
              ON shipping_info(order_id)`,
      purpose: 'Fast shipping info lookup',
    },
  ]

  let createdCount = 0
  let skippedCount = 0

  for (const index of indexes) {
    try {
      console.log(`⏳ Creating index: ${index.name}`)
      console.log(`   Purpose: ${index.purpose}`)

      await database.query(index.query)

      console.log(`   ✅ Created successfully\n`)
      createdCount++
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log(`   ℹ️  Index already exists\n`)
        skippedCount++
      } else {
        console.error(`   ❌ Error creating index:`, error.message)
      }
    }
  }

  console.log(`\n📊 Index Creation Summary:`)
  console.log(`   ✅ Created: ${createdCount}`)
  console.log(`   ℹ️  Skipped: ${skippedCount}`)
  console.log(`   📈 Total: ${indexes.length}\n`)

  // Verify indexes were created
  try {
    const result = await database.query(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND indexname LIKE 'idx_%'
      ORDER BY indexname
    `)

    console.log(`📈 All Active Indexes:`)
    result.rows.forEach((row) => {
      console.log(`   • ${row.indexname}`)
    })
    console.log()
  } catch (error) {
    console.error('⚠️  Could not verify indexes:', error.message)
  }
}

/**
 * Get Index Statistics
 * Shows current index usage and performance metrics
 */
export const getIndexStatistics = async () => {
  try {
    const result = await database.query(`
      SELECT
        schemaname,
        tablename,
        indexname,
        idx_scan as scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched,
        ROUND(100 * idx_tup_fetch / NULLIF(idx_tup_read, 0), 2) as efficiency_percent
      FROM pg_stat_user_indexes
      WHERE schemaname = 'public'
      ORDER BY idx_scan DESC
    `)

    return result.rows
  } catch (error) {
    console.error('Error fetching index statistics:', error.message)
    return []
  }
}

/**
 * Analyze Query Performance
 * Provides execution plans for queries
 */
export const analyzeQueryPerformance = async (query, params = []) => {
  try {
    const result = await database.query(`EXPLAIN ANALYZE ${query}`, params)
    return result.rows
  } catch (error) {
    console.error('Error analyzing query:', error.message)
    return null
  }
}

/**
 * Vacuum and Analyze Tables
 * Optimizes table storage and updates statistics
 */
export const optimizeTables = async () => {
  console.log('\n🧹 Optimizing database tables...\n')

  const tables = ['orders', 'products', 'users', 'reviews', 'order_items', 'wishlist_items']

  for (const table of tables) {
    try {
      console.log(`⏳ Vacuuming and analyzing ${table}...`)
      await database.query(`VACUUM ANALYZE ${table}`)
      console.log(`✅ Optimized ${table}\n`)
    } catch (error) {
      console.error(`❌ Error optimizing ${table}:`, error.message)
    }
  }

  console.log('✅ Database optimization complete\n')
}

/**
 * Check for Missing Indexes
 * Identifies slow queries that could benefit from indexes
 */
export const checkMissingIndexes = async () => {
  try {
    const result = await database.query(`
      SELECT
        schemaname,
        tablename,
        attname,
        n_distinct,
        correlation
      FROM pg_stats
      WHERE schemaname = 'public'
      AND n_distinct > 100
      AND correlation < 0.1
      ORDER BY n_distinct DESC
      LIMIT 10
    `)

    if (result.rows.length > 0) {
      console.log('\n📊 Columns that might benefit from indexes:')
      result.rows.forEach((row) => {
        console.log(`   • ${row.tablename}.${row.attname} (${row.n_distinct} distinct values)`)
      })
      console.log()
    }

    return result.rows
  } catch (error) {
    console.error('Error checking for missing indexes:', error.message)
    return []
  }
}

/**
 * Get Connection Pool Statistics
 */
export const getPoolStatistics = () => {
  if (!database.pool) {
    return null
  }

  return {
    totalCount: database.pool.totalCount,
    idleCount: database.pool.idleCount,
    waitingCount: database.pool.waitingCount,
  }
}
