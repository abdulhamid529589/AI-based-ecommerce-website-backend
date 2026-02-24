import database from '../database/db.js'

async function fixSubcategoriesTableSchema() {
  try {
    console.log('🔧 Fixing subcategories table schema...')

    // Drop the table and recreate with UUID
    await database.query(`DROP TABLE IF EXISTS subcategories`)
    console.log('✅ Dropped old subcategories table')

    // Create the table with UUID for category_id (to match categories)
    await database.query(`
      CREATE TABLE IF NOT EXISTS subcategories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category_id TEXT NOT NULL,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL,
        description TEXT,
        icon VARCHAR(100),
        image_url VARCHAR(500),
        position INT DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(category_id, slug)
      )
    `)

    console.log('✅ Subcategories table created with UUID support!')

    // Create index
    await database.query(
      `CREATE INDEX IF NOT EXISTS idx_subcategories_category_id ON subcategories(category_id)`,
    )

    console.log('✅ Subcategories index created successfully!')
    console.log('\n✨ Subcategories table is now ready!\n')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error fixing subcategories table:', error.message)
    process.exit(1)
  }
}

fixSubcategoriesTableSchema()
