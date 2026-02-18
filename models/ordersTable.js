import database from '../database/db.js'
export async function createOrdersTable() {
  try {
    const query = `CREATE TABLE IF NOT EXISTS orders (
         id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
         buyer_id UUID NOT NULL,
         total_price DECIMAL(10,2) NOT NULL CHECK (total_price >= 0),
         tax_price DECIMAL(10,2) NOT NULL CHECK (tax_price >= 0),
         shipping_price DECIMAL(10,2) NOT NULL CHECK (shipping_price >= 0),
         order_status VARCHAR(50) DEFAULT 'Processing' CHECK (order_status IN ('Processing', 'Shipped', 'Delivered', 'Cancelled')),
         paid_at TIMESTAMP CHECK (paid_at IS NULL OR paid_at <= CURRENT_TIMESTAMP),
         idempotency_key VARCHAR(255) UNIQUE,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE);`
    await database.query(query)

    // Check if idempotency_key column exists, if not add it
    const columnCheck = `SELECT column_name FROM information_schema.columns
                          WHERE table_name='orders' AND column_name='idempotency_key'`
    const result = await database.query(columnCheck)

    if (result.rows.length === 0) {
      // Column doesn't exist, add it
      const alterQuery = `ALTER TABLE orders ADD COLUMN idempotency_key VARCHAR(255) UNIQUE`
      await database.query(alterQuery)
      console.log('✅ Added idempotency_key column to orders table')
    }

    // Create index for idempotency key lookup (only if column exists now)
    const indexQuery = `CREATE INDEX IF NOT EXISTS idx_idempotency_key ON orders(idempotency_key, buyer_id)`
    await database.query(indexQuery)
  } catch (error) {
    console.error('❌ Failed To Create Orders Table.', error)
    process.exit(1)
  }
}
