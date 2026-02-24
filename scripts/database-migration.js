/**
 * Database Migration Manager
 * Automatically handles all database migrations and schema updates
 * This is the main migration orchestrator called during server startup
 */

import database from '../database/db.js'

/**
 * Complete list of all required columns for the products table
 */
const COMPLETE_COLUMNS_SCHEMA = [
  // Core fields (these should exist in the old schema)
  {
    name: 'id',
    definition: 'id UUID DEFAULT gen_random_uuid() PRIMARY KEY',
    critical: true,
    skip_if_exists: true,
  },
  {
    name: 'name',
    definition: 'name VARCHAR(255) NOT NULL',
    critical: true,
    skip_if_exists: true,
  },
  {
    name: 'description',
    definition: 'description TEXT',
    critical: true,
    skip_if_exists: true,
  },
  {
    name: 'price',
    definition: 'price DECIMAL(7,2) NOT NULL CHECK (price >= 0)',
    critical: true,
    skip_if_exists: true,
  },
  {
    name: 'category',
    definition: 'category VARCHAR(100) NOT NULL',
    critical: true,
    skip_if_exists: true,
  },
  {
    name: 'ratings',
    definition: 'ratings DECIMAL(3,2) DEFAULT 0 CHECK (ratings BETWEEN 0 AND 5)',
    critical: true,
    skip_if_exists: true,
  },
  {
    name: 'images',
    definition: "images JSONB DEFAULT '[]'::JSONB",
    critical: true,
    skip_if_exists: true,
  },
  {
    name: 'stock',
    definition: 'stock INT NOT NULL CHECK (stock >= 0)',
    critical: true,
    skip_if_exists: true,
  },
  {
    name: 'created_by',
    definition: 'created_by UUID',
    critical: true,
    skip_if_exists: true,
  },
  {
    name: 'created_at',
    definition: 'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    critical: true,
    skip_if_exists: true,
  },

  // Enhanced fields (safe to add with defaults)
  {
    name: 'short_description',
    definition: 'short_description TEXT',
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'sale_price',
    definition: 'sale_price DECIMAL(7,2)',
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'cost_price',
    definition: 'cost_price DECIMAL(7,2)',
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'brand',
    definition: 'brand VARCHAR(100)',
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'product_type',
    definition: "product_type VARCHAR(50) DEFAULT 'simple'",
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'sku',
    definition: 'sku VARCHAR(100) UNIQUE',
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'barcode',
    definition: 'barcode VARCHAR(255)',
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'slug',
    definition: 'slug VARCHAR(255) UNIQUE',
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'rating',
    definition: 'rating DECIMAL(3,2) DEFAULT 0 CHECK (rating BETWEEN 0 AND 5)',
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'review_count',
    definition: 'review_count INT DEFAULT 0',
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'image_alts',
    definition: "image_alts JSONB DEFAULT '[]'::JSONB",
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'tags',
    definition: "tags JSONB DEFAULT '[]'::JSONB",
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'low_stock_threshold',
    definition: 'low_stock_threshold INT DEFAULT 10',
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'stock_status',
    definition: "stock_status VARCHAR(50) DEFAULT 'in-stock'",
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'allow_backorders',
    definition: 'allow_backorders BOOLEAN DEFAULT false',
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'sold_individually',
    definition: 'sold_individually BOOLEAN DEFAULT false',
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'weight',
    definition: 'weight DECIMAL(8,2)',
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'weight_unit',
    definition: "weight_unit VARCHAR(20) DEFAULT 'kg'",
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'length',
    definition: 'length DECIMAL(8,2)',
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'width',
    definition: 'width DECIMAL(8,2)',
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'height',
    definition: 'height DECIMAL(8,2)',
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'shipping_class',
    definition: 'shipping_class VARCHAR(100)',
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'free_shipping',
    definition: 'free_shipping BOOLEAN DEFAULT false',
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'featured',
    definition: 'featured BOOLEAN DEFAULT false',
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'visibility',
    definition: "visibility VARCHAR(50) DEFAULT 'visible'",
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'enable_reviews',
    definition: 'enable_reviews BOOLEAN DEFAULT true',
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'meta_title',
    definition: 'meta_title VARCHAR(255)',
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'meta_description',
    definition: 'meta_description TEXT',
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'focus_keyword',
    definition: 'focus_keyword VARCHAR(100)',
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'purchase_note',
    definition: 'purchase_note TEXT',
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'menu_order',
    definition: 'menu_order INT DEFAULT 0',
    critical: false,
    skip_if_exists: true,
  },
  {
    name: 'updated_at',
    definition: 'updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    critical: false,
    skip_if_exists: true,
  },
]

/**
 * Get existing columns in the products table
 */
async function getExistingColumns() {
  try {
    const result = await database.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'products' AND table_schema = 'public'
      ORDER BY ordinal_position
    `)
    return result.rows.map((row) => row.column_name)
  } catch (error) {
    console.error('❌ Error fetching existing columns:', error.message)
    return []
  }
}

/**
 * Add a single column if it doesn't exist
 */
async function addColumnIfNotExists(columnName, columnDefinition) {
  try {
    const query = `ALTER TABLE products ADD COLUMN ${columnDefinition}`
    await database.query(query)
    console.log(`  ✅ Added column: ${columnName}`)
    return { success: true, added: true }
  } catch (error) {
    if (error.message.includes('already exists') || error.message.includes('duplicate key')) {
      return { success: true, added: false, reason: 'already exists' }
    }
    console.error(`  ❌ Error adding column ${columnName}:`, error.message)
    return { success: false, added: false, error: error.message }
  }
}

/**
 * Create indexes for better query performance
 */
async function createIndexes() {
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)`,
    `CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand)`,
    `CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)`,
    `CREATE INDEX IF NOT EXISTS idx_products_featured ON products(featured)`,
    `CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_products_visibility ON products(visibility)`,
    `CREATE INDEX IF NOT EXISTS idx_products_created_by ON products(created_by)`,
  ]

  let createdCount = 0
  for (const indexQuery of indexes) {
    try {
      await database.query(indexQuery)
      createdCount++
    } catch (error) {
      if (!error.message.includes('already exists')) {
        console.log(`  ⚠️  Could not create index: ${error.message.split('\n')[0]}`)
      }
    }
  }
  return createdCount
}

/**
 * Main migration function
 */
export async function runProductsMigration() {
  try {
    console.log('\n🔄 [DATABASE MIGRATION] Starting products table migration...')
    console.log('📊 [DATABASE MIGRATION] Checking existing columns...')

    const existingColumns = await getExistingColumns()
    console.log(`✅ [DATABASE MIGRATION] Found ${existingColumns.length} existing columns`)

    if (existingColumns.length === 0) {
      console.log('⚠️  [DATABASE MIGRATION] No products table found - will be created by app')
      return {
        status: 'warning',
        message: 'Products table does not exist yet',
        details: { existing: 0, added: 0, errors: 0 },
      }
    }

    let addedCount = 0
    let skippedCount = 0
    let errorCount = 0

    console.log('🔧 [DATABASE MIGRATION] Adding missing columns...')

    for (const column of COMPLETE_COLUMNS_SCHEMA) {
      // Skip if already exists
      if (existingColumns.includes(column.name)) {
        skippedCount++
        continue
      }

      const result = await addColumnIfNotExists(column.name, column.definition)

      if (result.success && result.added) {
        addedCount++
      } else if (!result.success) {
        errorCount++
        if (column.critical) {
          console.error(
            `❌ [DATABASE MIGRATION] CRITICAL: Failed to add required column: ${column.name}`,
          )
        }
      }
    }

    console.log('\n📑 [DATABASE MIGRATION] Creating indexes...')
    const indexesCreated = await createIndexes()
    console.log(`✅ [DATABASE MIGRATION] ${indexesCreated} indexes verified/created`)

    console.log('\n✅ [DATABASE MIGRATION] Migration Summary:')
    console.log(`   • Added columns: ${addedCount}`)
    console.log(`   • Existing columns: ${skippedCount}`)
    console.log(`   • Errors: ${errorCount}`)
    console.log(`   • Total: ${addedCount + skippedCount}/${COMPLETE_COLUMNS_SCHEMA.length}`)

    return {
      status: errorCount === 0 ? 'success' : 'partial',
      message:
        errorCount === 0 ? 'Migration completed successfully' : 'Migration completed with errors',
      details: {
        added: addedCount,
        existing: skippedCount,
        errors: errorCount,
        total: COMPLETE_COLUMNS_SCHEMA.length,
      },
    }
  } catch (error) {
    console.error('❌ [DATABASE MIGRATION] Fatal error during migration:', error)
    return {
      status: 'error',
      message: 'Migration failed',
      details: { error: error.message },
    }
  }
}

/**
 * Export migration info for status checks
 */
export function getMigrationInfo() {
  return {
    version: '1.0.0',
    totalColumns: COMPLETE_COLUMNS_SCHEMA.length,
    criticalColumns: COMPLETE_COLUMNS_SCHEMA.filter((c) => c.critical).length,
    enhancedColumns: COMPLETE_COLUMNS_SCHEMA.filter((c) => !c.critical).length,
  }
}
