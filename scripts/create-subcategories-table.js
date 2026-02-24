import database from '../database/db.js'

async function createSubcategoriesTableManual() {
  try {
    console.log('🔧 Creating subcategories table...')

    // Create the table WITHOUT foreign key constraint first (will add it later if categories table exists)
    await database.query(`
      CREATE TABLE IF NOT EXISTS subcategories (
        id SERIAL PRIMARY KEY,
        category_id INT NOT NULL,
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

    console.log('✅ Subcategories table created successfully!')

    // Create index
    await database.query(
      `CREATE INDEX IF NOT EXISTS idx_subcategories_category_id ON subcategories(category_id)`,
    )

    console.log('✅ Subcategories index created successfully!')

    // Try to add foreign key constraint if categories table exists
    try {
      await database.query(`
        ALTER TABLE subcategories
        ADD CONSTRAINT subcategories_category_id_fkey
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
      `)
      console.log('✅ Foreign key constraint added!')
    } catch (fkError) {
      console.log('ℹ️ Foreign key constraint not added (categories table may not exist yet)')
    }

    console.log('\n✨ Subcategories table is now ready to use!\n')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error creating subcategories table:', error.message)
    process.exit(1)
  }
}

createSubcategoriesTableManual()
