import database from '../database/db.js'

export async function createPromotionsTable() {
  try {
    const query = `
      CREATE TABLE IF NOT EXISTS promotions (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        type VARCHAR(20) NOT NULL CHECK (type IN ('percentage', 'fixed')),
        value DECIMAL(10, 2) NOT NULL CHECK (value > 0),
        min_order_value DECIMAL(10, 2) DEFAULT 0,
        max_uses INT,
        used_count INT DEFAULT 0,
        expiry_date TIMESTAMP,
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        created_by UUID NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_promotions_code ON promotions(code);
      CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(is_active);
      CREATE INDEX IF NOT EXISTS idx_promotions_expiry ON promotions(expiry_date);
    `

    await database.query(query)
    console.log('✅ Promotions table created successfully')
  } catch (error) {
    console.error('❌ Failed to create Promotions table:', error)
    // Continue without exiting - database may be unavailable
  }
}

export default createPromotionsTable
