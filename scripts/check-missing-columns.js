/**
 * Diagnostic Script: Check Missing Columns in Products Table
 * Shows exactly which columns are missing from your database
 * Run with: node scripts/check-missing-columns.js
 */

import database from '../database/db.js'

const EXPECTED_COLUMNS = [
  // Core fields
  'id',
  'name',
  'description',
  'category_id',
  'subcategory_id',
  'price',
  'discount_percentage',
  'stock',
  'image_urls',
  'created_at',
  'updated_at',

  // Optional fields that should exist
  'sale_price',
  'cost_price',
  'tags',
  'meta_title',
  'meta_description',
  'featured',
  'sku',
  'barcode',
  'weight',
  'dimensions',
  'shipping_class',
  'manufacturer',
  'warranty',
  'brand',
  'color',
  'size',
  'material',
  'care_instructions',
  'country_of_origin',
  'certification',
  'is_digital',
  'digital_file_url',
  'digital_license_key',
  'stock_status',
  'requires_shipping',
  'is_taxable',
  'tax_class',
  'product_type',
  'visibility',
  'rating',
  'rating_count',
]

async function checkMissingColumns() {
  try {
    console.log('🔍 Checking products table schema...\n')

    // Get actual columns from database
    const result = await database.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'products'
      ORDER BY column_name
    `)

    const existingColumns = result.rows.map((row) => row.column_name)
    const missingColumns = EXPECTED_COLUMNS.filter((col) => !existingColumns.includes(col))
    const extraColumns = existingColumns.filter((col) => !EXPECTED_COLUMNS.includes(col))

    console.log('📊 Database Schema Report:')
    console.log('═══════════════════════════════════════\n')

    console.log(`✅ Existing Columns: ${existingColumns.length}`)
    console.log(`❌ Missing Columns: ${missingColumns.length}`)
    console.log(`ℹ️  Extra Columns: ${extraColumns.length}\n`)

    if (missingColumns.length > 0) {
      console.log('❌ MISSING COLUMNS:')
      console.log('─────────────────')
      missingColumns.forEach((col, i) => {
        console.log(`  ${i + 1}. ${col}`)
      })
      console.log()
    }

    if (extraColumns.length > 0) {
      console.log('ℹ️  EXTRA COLUMNS (not in expected list):')
      console.log('──────────────────────────────────────')
      extraColumns.forEach((col, i) => {
        console.log(`  ${i + 1}. ${col}`)
      })
      console.log()
    }

    console.log('═══════════════════════════════════════')
    console.log('\n💡 To add missing columns, run:\n   node scripts/migrate-products-table.js\n')

    process.exit(0)
  } catch (error) {
    console.error('❌ Error checking columns:', error.message)
    process.exit(1)
  }
}

checkMissingColumns()
