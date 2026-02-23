/**
 * Startup Script: Runs migration and then starts the server
 * This script ensures the database schema is up to date before the app runs
 */

import database from '../database/db.js'
import app from '../app.js'

const PORT = process.env.PORT || 5000

const COLUMNS_TO_ADD = [
  {
    name: 'sale_price',
    definition: 'sale_price DECIMAL(7,2)',
  },
  {
    name: 'cost_price',
    definition: 'cost_price DECIMAL(7,2)',
  },
  {
    name: 'tags',
    definition: "tags JSONB DEFAULT '[]'::JSONB",
  },
  {
    name: 'meta_title',
    definition: 'meta_title VARCHAR(255)',
  },
  {
    name: 'meta_description',
    definition: 'meta_description TEXT',
  },
  {
    name: 'featured',
    definition: 'featured BOOLEAN DEFAULT false',
  },
  {
    name: 'visibility',
    definition: "visibility VARCHAR(50) DEFAULT 'visible'",
  },
  {
    name: 'image_alts',
    definition: "image_alts JSONB DEFAULT '[]'::JSONB",
  },
]

async function getExistingColumns() {
  try {
    const result = await database.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'products' AND table_schema = 'public'
    `)
    return result.rows.map((row) => row.column_name)
  } catch (error) {
    console.error('❌ Error checking columns:', error.message)
    return []
  }
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

async function runMigration() {
  try {
    console.log('🔄 [STARTUP] Running database migration...')

    const existingColumns = await getExistingColumns()
    console.log(`📊 [STARTUP] Found ${existingColumns.length} existing columns`)

    let addedCount = 0
    let skippedCount = 0

    for (const column of COLUMNS_TO_ADD) {
      if (existingColumns.includes(column.name)) {
        console.log(`⏭️  [STARTUP] Column already exists: ${column.name}`)
        skippedCount++
      } else {
        const success = await addColumnIfNotExists(column.name, column.definition)
        if (success) {
          addedCount++
        }
      }
    }

    console.log('\n✅ [STARTUP] Migration complete!')
    console.log(`   Added: ${addedCount} columns`)
    console.log(`   Already existed: ${skippedCount} columns`)
    console.log(`   Total: ${addedCount + skippedCount}/${COLUMNS_TO_ADD.length}\n`)

    return true
  } catch (error) {
    console.error('❌ [STARTUP] Migration failed:', error.message)
    console.error('⚠️  WARNING: Starting server anyway, but optional fields may not work')
    return false
  }
}

async function startServer() {
  try {
    // Run migration first
    await runMigration()

    // Then start the server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`)
    })
  } catch (error) {
    console.error('❌ Failed to start server:', error.message)
    process.exit(1)
  }
}

startServer()
