/**
 * Database Schema Initialization
 * Adds missing columns to products table to support enhanced product management
 * Run once to initialize the schema with all required fields
 */

import database from './db.js'

const initializeSchema = async () => {
  try {
    console.log('📋 Starting schema initialization...')

    // Array of columns to add (only if they don't exist)
    const columnsToAdd = [
      {
        name: 'slug',
        definition: 'slug VARCHAR(255) UNIQUE',
        description: 'Product URL slug',
      },
      {
        name: 'sku',
        definition: 'sku VARCHAR(100)',
        description: 'Stock Keeping Unit',
      },
      {
        name: 'barcode',
        definition: 'barcode VARCHAR(100)',
        description: 'Product barcode',
      },
      {
        name: 'short_description',
        definition: 'short_description TEXT',
        description: 'Brief product description',
      },
      {
        name: 'sale_price',
        definition: 'sale_price DECIMAL(10,2)',
        description: 'Sale/discount price',
      },
      {
        name: 'cost_price',
        definition: 'cost_price DECIMAL(10,2)',
        description: 'Cost price for profit calculation',
      },
      {
        name: 'product_type',
        definition: "product_type VARCHAR(50) DEFAULT 'simple'",
        description: 'Product type: simple, variable, etc',
      },
      {
        name: 'weight',
        definition: 'weight DECIMAL(8,3)',
        description: 'Product weight',
      },
      {
        name: 'weight_unit',
        definition: "weight_unit VARCHAR(10) DEFAULT 'kg'",
        description: 'Weight unit: kg, lbs, etc',
      },
      {
        name: 'length',
        definition: 'length DECIMAL(8,3)',
        description: 'Product length',
      },
      {
        name: 'width',
        definition: 'width DECIMAL(8,3)',
        description: 'Product width',
      },
      {
        name: 'height',
        definition: 'height DECIMAL(8,3)',
        description: 'Product height',
      },
      {
        name: 'low_stock_threshold',
        definition: 'low_stock_threshold INT DEFAULT 10',
        description: 'Threshold for low stock warning',
      },
      {
        name: 'stock_status',
        definition: "stock_status VARCHAR(50) DEFAULT 'in-stock'",
        description: 'Stock status: in-stock, out-of-stock, pre-order',
      },
      {
        name: 'allow_backorders',
        definition: 'allow_backorders BOOLEAN DEFAULT false',
        description: 'Allow customers to backorder out-of-stock items',
      },
      {
        name: 'sold_individually',
        definition: 'sold_individually BOOLEAN DEFAULT false',
        description: 'Limit purchase quantity to 1 per order',
      },
      {
        name: 'brand',
        definition: 'brand VARCHAR(255)',
        description: 'Product brand/manufacturer',
      },
      {
        name: 'tags',
        definition: 'tags JSON',
        description: 'Product tags (stored as JSON array)',
      },
      {
        name: 'shipping_class',
        definition: "shipping_class VARCHAR(50) DEFAULT 'standard'",
        description: 'Shipping class for rate calculations',
      },
      {
        name: 'free_shipping',
        definition: 'free_shipping BOOLEAN DEFAULT false',
        description: 'Whether product qualifies for free shipping',
      },
      {
        name: 'meta_title',
        definition: 'meta_title VARCHAR(255)',
        description: 'SEO meta title',
      },
      {
        name: 'meta_description',
        definition: 'meta_description TEXT',
        description: 'SEO meta description',
      },
      {
        name: 'focus_keyword',
        definition: 'focus_keyword VARCHAR(255)',
        description: 'Primary SEO keyword',
      },
      {
        name: 'purchase_note',
        definition: 'purchase_note TEXT',
        description: 'Note to display after purchase',
      },
      {
        name: 'enable_reviews',
        definition: 'enable_reviews BOOLEAN DEFAULT true',
        description: 'Enable product reviews',
      },
      {
        name: 'featured',
        definition: 'featured BOOLEAN DEFAULT false',
        description: 'Feature product on homepage',
      },
      {
        name: 'visibility',
        definition: "visibility VARCHAR(50) DEFAULT 'public'",
        description: 'Product visibility: public, hidden, private',
      },
      {
        name: 'catalog_visibility',
        definition: "catalog_visibility VARCHAR(50) DEFAULT 'visible'",
        description: 'Visibility in catalog: visible, hidden, search_only',
      },
      {
        name: 'image_alts',
        definition: 'image_alts JSON',
        description: 'Alt text for images (stored as JSON)',
      },
      {
        name: 'menu_order',
        definition: 'menu_order INT DEFAULT 0',
        description: 'Menu order for sorting',
      },
    ]

    // Check which columns already exist
    console.log('🔍 Checking existing columns...')
    const result = await database.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'products'`,
    )
    const existingColumns = new Set(result.rows.map((r) => r.column_name))

    // Add missing columns
    let addedCount = 0
    for (const column of columnsToAdd) {
      if (!existingColumns.has(column.name)) {
        try {
          console.log(`  ➕ Adding column: ${column.name} (${column.description})`)
          await database.query(`ALTER TABLE products ADD COLUMN ${column.definition}`)
          addedCount++
        } catch (err) {
          console.error(`  ❌ Error adding column ${column.name}:`, err.message.split('\n')[0])
        }
      } else {
        console.log(`  ✅ Column already exists: ${column.name}`)
      }
    }

    console.log(`\n✨ Schema initialization complete! Added ${addedCount} new columns.`)
    console.log('📊 Products table now supports all enhanced fields.')

    return { success: true, columnsAdded: addedCount, totalColumns: columnsToAdd.length }
  } catch (err) {
    console.error('❌ Schema initialization failed:', err.message)
    throw err
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  initializeSchema()
    .then(() => {
      console.log('\n✅ Done!')
      process.exit(0)
    })
    .catch((err) => {
      console.error('\n❌ Failed:', err)
      process.exit(1)
    })
}

export default initializeSchema
