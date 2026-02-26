/**
 * Database Health Check
 * Comprehensive database diagnostics and health report
 * Run with: npm run health:check
 */

import database from '../database/db.js'

async function runHealthCheck() {
  console.log('\n🏥 DATABASE HEALTH CHECK')
  console.log('═══════════════════════════════════════════\n')

  try {
    // 1. Connection test
    console.log('1️⃣  Testing database connection...')
    const connTest = await database.query('SELECT NOW()')
    console.log('   ✅ Connection successful')
    console.log(`   📅 Server time: ${connTest.rows[0].now}\n`)

    // 2. List all tables
    console.log('2️⃣  Checking tables...')
    const tables = await database.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `)
    console.log(`   ✅ Found ${tables.rows.length} tables`)
    tables.rows.forEach((t) => console.log(`      • ${t.table_name}`))
    console.log()

    // 3. Check row counts
    console.log('3️⃣  Table row counts...')
    const criticalTables = ['users', 'products', 'orders', 'categories']
    for (const table of criticalTables) {
      try {
        const count = await database.query(`SELECT COUNT(*) as count FROM ${table}`)
        console.log(`   • ${table}: ${count.rows[0].count} rows`)
      } catch (e) {
        console.log(`   • ${table}: ⚠️ Table doesn't exist`)
      }
    }
    console.log()

    // 4. Check database size
    console.log('4️⃣  Database size...')
    const size = await database.query(`
      SELECT pg_size_pretty(pg_database_size(current_database())) as size
    `)
    console.log(`   ✅ Database size: ${size.rows[0].size}\n`)

    // 5. Check for orphaned records
    console.log('5️⃣  Checking data integrity...')
    try {
      const orphaned = await database.query(`
        SELECT COUNT(*) as count FROM products
        WHERE category_id NOT IN (SELECT id FROM categories)
      `)
      if (orphaned.rows[0].count > 0) {
        console.log(`   ⚠️  Found ${orphaned.rows[0].count} products with invalid category_id`)
      } else {
        console.log(`   ✅ No orphaned products`)
      }
    } catch (e) {
      console.log(`   ℹ️  Integrity check skipped (table structure different)`)
    }
    console.log()

    // 6. Active connections
    console.log('6️⃣  Database connections...')
    const connections = await database.query(`
      SELECT count(*) as active_connections
      FROM pg_stat_activity
      WHERE datname = current_database()
    `)
    console.log(`   ✅ Active connections: ${connections.rows[0].active_connections}\n`)

    console.log('═══════════════════════════════════════════')
    console.log('✅ Health check complete!\n')

    process.exit(0)
  } catch (error) {
    console.error('❌ Health check failed:', error.message)
    console.error('\n📝 Troubleshooting:')
    console.error('   1. Check DATABASE_URL environment variable')
    console.error('   2. Verify database is running')
    console.error('   3. Check network connectivity to database\n')
    process.exit(1)
  }
}

runHealthCheck()
