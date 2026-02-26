/**
 * Full System Diagnostics
 * Comprehensive health check for production
 * Run with: npm run diagnostics
 */

import database from '../database/db.js'
import { execSync } from 'child_process'

async function runDiagnostics() {
  console.log('\n🔧 SYSTEM DIAGNOSTICS')
  console.log('═══════════════════════════════════════════\n')

  const report = {
    timestamp: new Date().toISOString(),
    status: '✅',
    checks: {},
  }

  try {
    // 1. Environment check
    console.log('1️⃣  Environment variables...')
    const requiredVars = ['DATABASE_URL', 'PORT', 'JWT_SECRET_KEY', 'FRONTEND_URL', 'DASHBOARD_URL']
    const missingVars = requiredVars.filter((v) => !process.env[v])
    if (missingVars.length === 0) {
      console.log('   ✅ All required variables set\n')
      report.checks.environment = { status: '✅', message: 'All variables present' }
    } else {
      console.log(`   ❌ Missing: ${missingVars.join(', ')}\n`)
      report.checks.environment = {
        status: '❌',
        message: `Missing: ${missingVars.join(', ')}`,
      }
      report.status = '⚠️'
    }

    // 2. Database connection
    console.log('2️⃣  Database connection...')
    const connTest = await database.query('SELECT NOW()')
    console.log('   ✅ Connected\n')
    report.checks.database = { status: '✅', message: 'Connection successful' }

    // 3. Tables check
    console.log('3️⃣  Database tables...')
    const tables = await database.query(`
      SELECT count(*) as count FROM information_schema.tables
      WHERE table_schema = 'public'
    `)
    const tableCount = tables.rows[0].count
    console.log(`   ✅ ${tableCount} tables found\n`)
    report.checks.tables = { status: '✅', message: `${tableCount} tables` }

    // 4. Data consistency
    console.log('4️⃣  Data integrity...')
    const integrity = await database.query(`
      SELECT
        (SELECT COUNT(*) FROM products WHERE price IS NULL OR price <= 0) as bad_prices,
        (SELECT COUNT(*) FROM products WHERE stock < 0) as negative_stock,
        (SELECT COUNT(*) FROM orders WHERE total_price IS NULL) as bad_orders
    `)
    const integrityIssues = integrity.rows[0]
    const hasIssues =
      integrityIssues.bad_prices > 0 ||
      integrityIssues.negative_stock > 0 ||
      integrityIssues.bad_orders > 0

    if (hasIssues) {
      console.log(`   ⚠️  Issues found:`)
      if (integrityIssues.bad_prices > 0)
        console.log(`      • ${integrityIssues.bad_prices} products with invalid prices`)
      if (integrityIssues.negative_stock > 0)
        console.log(`      • ${integrityIssues.negative_stock} products with negative stock`)
      if (integrityIssues.bad_orders > 0)
        console.log(`      • ${integrityIssues.bad_orders} orders with no price`)
      console.log()
      report.checks.integrity = { status: '⚠️', message: 'Issues found', issues: integrityIssues }
      report.status = '⚠️'
    } else {
      console.log('   ✅ All data consistent\n')
      report.checks.integrity = { status: '✅', message: 'Data consistent' }
    }

    // 5. Performance metrics
    console.log('5️⃣  Performance...')
    const stats = await database.query(`
      SELECT
        (SELECT count(*) FROM products) as products,
        (SELECT count(*) FROM orders) as orders,
        (SELECT count(*) FROM users) as users,
        pg_size_pretty(pg_database_size(current_database())) as db_size
    `)
    const data = stats.rows[0]
    console.log(`   📊 Products: ${data.products}`)
    console.log(`   📊 Orders: ${data.orders}`)
    console.log(`   📊 Users: ${data.users}`)
    console.log(`   💾 Database size: ${data.db_size}\n`)
    report.checks.performance = {
      status: '✅',
      data: { products: data.products, orders: data.orders, users: data.users },
    }

    // Summary
    console.log('═══════════════════════════════════════════')
    console.log(
      `\n${report.status} OVERALL STATUS: ${report.status === '✅' ? 'HEALTHY' : 'ISSUES FOUND'}`,
    )
    console.log(`📅 Timestamp: ${report.timestamp}\n`)

    console.log('CHECKS:')
    Object.entries(report.checks).forEach(([key, check]) => {
      console.log(`   ${check.status} ${key}: ${check.message}`)
    })

    console.log('\n💡 Recommended actions:')
    if (report.status === '⚠️') {
      console.log('   1. Run: npm run check:integrity')
      console.log('   2. Run: npm run db:cleanup')
      console.log('   3. Check logs for errors')
    } else {
      console.log('   ✅ System is healthy!')
      console.log('   Run this weekly to monitor performance')
    }
    console.log()

    process.exit(report.status === '✅' ? 0 : 1)
  } catch (error) {
    console.error('❌ Diagnostics failed:', error.message)
    process.exit(1)
  }
}

runDiagnostics()
