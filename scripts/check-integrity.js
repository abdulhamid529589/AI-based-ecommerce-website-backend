/**
 * Data Integrity Checker
 * Finds and reports data inconsistencies
 * Run with: npm run check:integrity
 */

import database from '../database/db.js'

async function checkIntegrity() {
  console.log('\n🔍 DATA INTEGRITY CHECK')
  console.log('═══════════════════════════════════════════\n')

  const issues = []

  try {
    // 1. Check for NULL prices
    console.log('1️⃣  Checking product prices...')
    const nullPrices = await database.query(`
      SELECT COUNT(*) as count FROM products
      WHERE price IS NULL OR price <= 0
    `)
    if (nullPrices.rows[0].count > 0) {
      issues.push(`⚠️  ${nullPrices.rows[0].count} products have invalid prices`)
      console.log(`   ⚠️  Found ${nullPrices.rows[0].count} products with NULL or 0 prices`)
    } else {
      console.log(`   ✅ All products have valid prices`)
    }
    console.log()

    // 2. Check for orphaned products
    console.log('2️⃣  Checking for orphaned products...')
    const orphanedProducts = await database.query(`
      SELECT COUNT(*) as count FROM products
      WHERE category_id NOT IN (SELECT id FROM categories)
      AND category_id IS NOT NULL
    `)
    if (orphanedProducts.rows[0].count > 0) {
      issues.push(`⚠️  ${orphanedProducts.rows[0].count} products have invalid categories`)
      console.log(
        `   ⚠️  Found ${orphanedProducts.rows[0].count} products with invalid category_id`,
      )
    } else {
      console.log(`   ✅ All products have valid categories`)
    }
    console.log()

    // 3. Check for orphaned order items
    console.log('3️⃣  Checking for orphaned order items...')
    const orphanedItems = await database.query(`
      SELECT COUNT(*) as count FROM order_items
      WHERE order_id NOT IN (SELECT id FROM orders)
    `)
    if (orphanedItems.rows[0].count > 0) {
      issues.push(`⚠️  ${orphanedItems.rows[0].count} order items have invalid orders`)
      console.log(`   ⚠️  Found ${orphanedItems.rows[0].count} orphaned order items`)
    } else {
      console.log(`   ✅ All order items have valid orders`)
    }
    console.log()

    // 4. Check for duplicate data
    console.log('4️⃣  Checking for duplicates...')
    const duplicateEmails = await database.query(`
      SELECT email, COUNT(*) as count FROM users
      GROUP BY email HAVING COUNT(*) > 1
    `)
    if (duplicateEmails.rows.length > 0) {
      issues.push(`⚠️  ${duplicateEmails.rows.length} duplicate emails found`)
      console.log(`   ⚠️  Found ${duplicateEmails.rows.length} duplicate email addresses`)
    } else {
      console.log(`   ✅ No duplicate emails`)
    }
    console.log()

    // 5. Check for stock inconsistencies
    console.log('5️⃣  Checking product stock...')
    const negativeStock = await database.query(`
      SELECT COUNT(*) as count FROM products
      WHERE stock < 0
    `)
    if (negativeStock.rows[0].count > 0) {
      issues.push(`⚠️  ${negativeStock.rows[0].count} products have negative stock`)
      console.log(`   ⚠️  Found ${negativeStock.rows[0].count} products with negative stock`)
    } else {
      console.log(`   ✅ All products have valid stock levels`)
    }
    console.log()

    // 6. Summary
    console.log('═══════════════════════════════════════════')
    if (issues.length === 0) {
      console.log('\n✅ No data integrity issues found!\n')
      process.exit(0)
    } else {
      console.log('\n⚠️  ISSUES FOUND:')
      issues.forEach((issue) => console.log(`   ${issue}`))
      console.log('\n💡 Run: npm run db:cleanup\n')
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Integrity check failed:', error.message)
    process.exit(1)
  }
}

checkIntegrity()
