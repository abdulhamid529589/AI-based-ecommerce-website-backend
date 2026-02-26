/**
 * Database Cleanup & Optimization
 * Fixes common database issues and optimizes performance
 * Run with: npm run db:cleanup
 */

import database from '../database/db.js'

async function cleanup() {
  console.log('\n🧹 DATABASE CLEANUP & OPTIMIZATION')
  console.log('═══════════════════════════════════════════\n')

  try {
    // 1. Vacuum and analyze
    console.log('1️⃣  Optimizing database...')
    await database.query('VACUUM ANALYZE')
    console.log('   ✅ Vacuum and analyze complete\n')

    // 2. Remove old logs (older than 30 days)
    console.log('2️⃣  Cleaning up old audit logs...')
    const logsDeleted = await database.query(`
      DELETE FROM audit_logs
      WHERE created_at < NOW() - INTERVAL '30 days'
      RETURNING id
    `)
    console.log(`   ✅ Removed ${logsDeleted.rowCount} old audit logs\n`)

    // 3. Reindex tables
    console.log('3️⃣  Reindexing tables...')
    const tables = ['products', 'orders', 'users', 'categories']
    for (const table of tables) {
      try {
        await database.query(`REINDEX TABLE ${table}`)
        console.log(`   ✅ Reindexed ${table}`)
      } catch (e) {
        console.log(`   ⚠️  Skipped ${table} (doesn't exist)`)
      }
    }
    console.log()

    // 4. Check for missing indexes
    console.log('4️⃣  Creating missing indexes...')
    const indexes = [
      { table: 'products', column: 'category_id' },
      { table: 'products', column: 'created_at' },
      { table: 'orders', column: 'user_id' },
      { table: 'orders', column: 'created_at' },
    ]
    for (const idx of indexes) {
      try {
        await database.query(
          `CREATE INDEX IF NOT EXISTS idx_${idx.table}_${idx.column} ON ${idx.table}(${idx.column})`,
        )
        console.log(`   ✅ Index on ${idx.table}.${idx.column}`)
      } catch (e) {
        console.log(`   ⚠️  Skipped ${idx.table}.${idx.column}`)
      }
    }
    console.log()

    // 5. Statistics
    console.log('5️⃣  Database statistics...')
    const stats = await database.query(`
      SELECT
        (SELECT count(*) FROM products) as products,
        (SELECT count(*) FROM orders) as orders,
        (SELECT count(*) FROM users) as users,
        (SELECT count(*) FROM categories) as categories
    `)
    const row = stats.rows[0]
    console.log(`   📊 Products: ${row.products}`)
    console.log(`   📊 Orders: ${row.orders}`)
    console.log(`   📊 Users: ${row.users}`)
    console.log(`   📊 Categories: ${row.categories}\n`)

    console.log('═══════════════════════════════════════════')
    console.log('✅ Cleanup complete!\n')
    process.exit(0)
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message)
    process.exit(1)
  }
}

cleanup()
