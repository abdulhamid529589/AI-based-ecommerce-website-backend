import database from '../database/db.js'
export async function createProductReviewsTable() {
  try {
    const query = `CREATE TABLE IF NOT EXISTS reviews (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID NOT NULL,
    user_id UUID NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    verified_purchase BOOLEAN DEFAULT false,
    helpful_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);`
    await database.query(query)

    // Add missing columns if they don't exist (for existing tables)
    const alterQueries = [
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS title VARCHAR(255);`,
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS content TEXT;`,
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS verified_purchase BOOLEAN DEFAULT false;`,
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS helpful_count INTEGER DEFAULT 0;`,
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`,
    ]

    for (const alterQuery of alterQueries) {
      try {
        await database.query(alterQuery)
      } catch (error) {
        // Column might already exist, continue
      }
    }

    console.log('✅ Reviews table initialized successfully')
  } catch (error) {
    console.error('❌ Failed To Create Products Reviews Table.', error)
    // Continue without exiting - database may be unavailable
  }
}
