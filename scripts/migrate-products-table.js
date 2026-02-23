/**
 * Migration Script: Add missing columns to products table
 * This script safely adds columns that may be missing in production database
 * Run with: node scripts/migrate-products-table.js
 */

import database from '../database/db.js'

const COLUMNS_TO_ADD = [
  {
    name: 'sale_price',
    definition: 'sale_price DECIMAL(7,2)',
    check: 'CHECK (sale_price >= 0)',
  },
  {
    name: 'cost_price',
    definition: 'cost_price DECIMAL(7,2)',
    check: 'CHECK (cost_price >= 0)',
  },
  {
    name: 'tags',
    definition: "tags JSONB DEFAULT '[]'::JSONB",
    check: null,
  },
  {
    name: 'meta_title',
    definition: 'meta_title VARCHAR(255)',
    check: null,
  },
  {
    name: 'meta_description',
    definition: 'meta_description TEXT',
    check: null,
  },
  {
    name: 'featured',
    definition: 'featured BOOLEAN DEFAULT false',
    check: null,
  },
  {
    name: 'visibility',
    definition: "visibility VARCHAR(50) DEFAULT 'visible'",
    check: null,
  },
  {
    name: 'image_alts',
    definition: "image_alts JSONB DEFAULT '[]'::JSONB",
    check: null,
  },
  {
    name: 'short_description',
    definition: 'short_description TEXT',
    check: null,
  },
  {
    name: 'brand',
    definition: 'brand VARCHAR(100)',
    check: null,
  },
  {
    name: 'product_type',
    definition: "product_type VARCHAR(50) DEFAULT 'simple'",
    check: null,
  },
  {
    name: 'weight',
    definition: 'weight DECIMAL(8,2)',
    check: null,
  },
  {
    name: 'weight_unit',
    definition: "weight_unit VARCHAR(20) DEFAULT 'kg'",
    check: null,
  },
  {
    name: 'length',
    definition: 'length DECIMAL(8,2)',
    check: null,
  },
  {
    name: 'width',
    definition: 'width DECIMAL(8,2)',
    check: null,
  },
  {
    name: 'height',
    definition: 'height DECIMAL(8,2)',
    check: null,
  },
  {
    name: 'low_stock_threshold',
    definition: 'low_stock_threshold INT DEFAULT 10',
    check: null,
  },
  {
    name: 'stock_status',
    definition: "stock_status VARCHAR(50) DEFAULT 'in-stock'",
    check: null,
  },
  {
    name: 'allow_backorders',
    definition: 'allow_backorders BOOLEAN DEFAULT false',
    check: null,
  },
  {
    name: 'sold_individually',
    definition: 'sold_individually BOOLEAN DEFAULT false',
    check: null,
  },
  {
    name: 'shipping_class',
    definition: 'shipping_class VARCHAR(100)',
    check: null,
  },
  {
    name: 'free_shipping',
    definition: 'free_shipping BOOLEAN DEFAULT false',
    check: null,
  },
  {
    name: 'enable_reviews',
    definition: 'enable_reviews BOOLEAN DEFAULT true',
    check: null,
  },
  {
    name: 'focus_keyword',
    definition: 'focus_keyword VARCHAR(100)',
    check: null,
  },
  {
    name: 'purchase_note',
    definition: 'purchase_note TEXT',
    check: null,
  },
  {
    name: 'menu_order',
    definition: 'menu_order INT DEFAULT 0',
    check: null,
  },
]

async function getExistingColumns() {
  const result = await database.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'products' AND table_schema = 'public'
  `)
  return result.rows.map((row) => row.column_name)
}

async function addColumnIfNotExists(columnName, columnDefinition) {
  try {
    const query = `ALTER TABLE products ADD COLUMN ${columnDefinition}`
    await database.query(query)
    console.log(`✅ Added column: ${columnName}`)
    return true
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log(`⏭️  Column already exists: ${columnName}`)
      return true
    }
    console.error(`❌ Error adding column ${columnName}:`, error.message)
    return false
  }
}

async function migrateProductsTable() {
  try {
    console.log('🔄 Starting products table migration...')
    console.log('📊 Checking existing columns...')

    const existingColumns = await getExistingColumns()
    console.log(`Found ${existingColumns.length} existing columns`)

    let addedCount = 0
    let skippedCount = 0

    for (const column of COLUMNS_TO_ADD) {
      if (existingColumns.includes(column.name)) {
        console.log(`⏭️  Column already exists: ${column.name}`)
        skippedCount++
      } else {
        const success = await addColumnIfNotExists(column.name, column.definition)
        if (success) {
          addedCount++
        }
      }
    }

    console.log('\n✅ Migration complete!')
    console.log(`   Added: ${addedCount} columns`)
    console.log(`   Already existed: ${skippedCount} columns`)
    console.log(`   Total: ${addedCount + skippedCount}/${COLUMNS_TO_ADD.length}`)

    process.exit(0)
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

migrateProductsTable()
