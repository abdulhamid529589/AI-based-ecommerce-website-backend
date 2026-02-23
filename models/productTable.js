import database from '../database/db.js'

export async function createProductsTable() {
  try {
    const query = `CREATE TABLE IF NOT EXISTS products (
         id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
         name VARCHAR(255) NOT NULL,
         description TEXT,
         short_description TEXT,
         price DECIMAL(7,2) NOT NULL CHECK (price >= 0),
         sale_price DECIMAL(7,2),
         cost_price DECIMAL(7,2),
         category VARCHAR(100) NOT NULL,
         brand VARCHAR(100),
         product_type VARCHAR(50) DEFAULT 'simple',
         sku VARCHAR(100) UNIQUE,
         barcode VARCHAR(255),
         slug VARCHAR(255) UNIQUE,
         rating DECIMAL(3,2) DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
         ratings DECIMAL(3,2) DEFAULT 0 CHECK (ratings BETWEEN 0 AND 5),
         review_count INT DEFAULT 0,
         images JSONB DEFAULT '[]'::JSONB,
         image_alts JSONB DEFAULT '[]'::JSONB,
         tags JSONB DEFAULT '[]'::JSONB,
         stock INT NOT NULL CHECK (stock >= 0),
         low_stock_threshold INT DEFAULT 10,
         stock_status VARCHAR(50) DEFAULT 'in-stock',
         allow_backorders BOOLEAN DEFAULT false,
         sold_individually BOOLEAN DEFAULT false,
         weight DECIMAL(8,2),
         weight_unit VARCHAR(20) DEFAULT 'kg',
         length DECIMAL(8,2),
         width DECIMAL(8,2),
         height DECIMAL(8,2),
         shipping_class VARCHAR(100),
         free_shipping BOOLEAN DEFAULT false,
         featured BOOLEAN DEFAULT false,
         visibility VARCHAR(50) DEFAULT 'visible',
         enable_reviews BOOLEAN DEFAULT true,
         meta_title VARCHAR(255),
         meta_description TEXT,
         focus_keyword VARCHAR(100),
         purchase_note TEXT,
         menu_order INT DEFAULT 0,
         created_by UUID,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL);`
    await database.query(query)

    // Create indexes for better query performance
    const indexQueries = [
      `CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);`,
      `CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);`,
      `CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);`,
      `CREATE INDEX IF NOT EXISTS idx_products_featured ON products(featured);`,
      `CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_products_visibility ON products(visibility);`,
    ]

    for (const indexQuery of indexQueries) {
      await database.query(indexQuery)
    }
  } catch (error) {
    console.error('❌ Failed To Create Products Table.', error)
    // Continue without exiting - database may be unavailable
  }
}
