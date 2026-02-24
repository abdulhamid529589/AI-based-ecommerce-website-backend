/**
 * Clean up test data from the database
 * Run: node cleanup-test-data.js
 */

import dotenv from 'dotenv'
import pool from './database/db.js'

dotenv.config()

async function cleanupTestData() {
  try {
    console.log('\n🧹 Starting test data cleanup...')
    console.log('================================================\n')

    // 1. Get test products count before cleanup
    const beforeResult = await pool.query('SELECT COUNT(*) as count FROM products')
    const beforeCount = parseInt(beforeResult.rows[0].count)
    console.log(`📊 Products before cleanup: ${beforeCount}`)

    // 2. Delete test products (products with 'bedding' category from tests)
    console.log('\n🔍 Deleting test products...')

    // Delete products from test categories
    const deleteResult = await pool.query(`
      DELETE FROM products
      WHERE
        LOWER(category) = 'bedding' OR
        LOWER(name) LIKE '%test%' OR
        LOWER(description) LIKE '%test%' OR
        name LIKE '%Phase%' OR
        LOWER(sku) LIKE '%test%'
    `)

    console.log(`✅ Deleted ${deleteResult.rowCount} test products`)

    // 3. Delete test reviews (if table exists)
    console.log('\n🔍 Deleting test reviews...')
    try {
      const reviewResult = await pool.query(`
        DELETE FROM product_reviews
        WHERE LOWER(review) LIKE '%test%' OR LOWER(title) LIKE '%test%'
      `)
      console.log(`✅ Deleted ${reviewResult.rowCount} test reviews`)
    } catch (err) {
      console.log(`ℹ️  Review table not found (OK)`)
    }

    // 4. Delete test orders (if table exists)
    console.log('\n🔍 Deleting test orders...')
    try {
      const orderResult = await pool.query(`
        DELETE FROM orders
        WHERE created_at < NOW() - INTERVAL '1 day' AND total_price = 0
      `)
      console.log(`✅ Deleted ${orderResult.rowCount} test orders`)
    } catch (err) {
      console.log(`ℹ️  Orders cleanup skipped (OK)`)
    }
    const afterResult = await pool.query('SELECT COUNT(*) as count FROM products')
    const afterCount = parseInt(afterResult.rows[0].count)
    console.log(`\n📊 Products after cleanup: ${afterCount}`)
    console.log(`📉 Total removed: ${beforeCount - afterCount}`)

    // 6. Show remaining categories
    const catResult = await pool.query('SELECT * FROM categories ORDER BY name')
    console.log(`\n📂 Remaining categories (${catResult.rows.length}):`)
    catResult.rows.forEach((cat) => {
      console.log(`   • ${cat.name}`)
    })

    // 7. Show sample products
    console.log(`\n📦 Sample remaining products:`)
    const prodResult = await pool.query('SELECT id, name, category FROM products LIMIT 5')
    prodResult.rows.forEach((prod) => {
      console.log(`   • ${prod.name} (${prod.category})`)
    })

    console.log('\n✅ Cleanup complete!')
    console.log('================================================\n')

    process.exit(0)
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message)
    process.exit(1)
  }
}

cleanupTestData()
