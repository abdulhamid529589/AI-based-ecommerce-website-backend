import database from '../database/db.js'

async function addColumnIfMissing(table, column, definition) {
  const col = await database.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = $1 AND column_name = $2`,
    [table, column],
  )
  if (col.rows.length === 0) {
    await database.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    console.log(`✅ Added ${table}.${column}`)
  }
}

/**
 * Phase 1B + 2A tables: disputes/refunds, shipping zones, loyalty, risk, vendor promos.
 */
export async function migrateMarketplaceOpsSchema() {
  try {
    // ── Shipping zones & rates ─────────────────────────────────────────────
    await database.query(`
      CREATE TABLE IF NOT EXISTS shipping_zones (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        cities TEXT[] DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        estimated_days_min INT DEFAULT 2,
        estimated_days_max INT DEFAULT 5,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await database.query(`
      CREATE TABLE IF NOT EXISTS shipping_rates (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        zone_id UUID NOT NULL REFERENCES shipping_zones(id) ON DELETE CASCADE,
        carrier VARCHAR(60) DEFAULT 'standard',
        name VARCHAR(120) NOT NULL,
        base_rate DECIMAL(12,2) NOT NULL CHECK (base_rate >= 0),
        per_kg_rate DECIMAL(12,2) DEFAULT 0 CHECK (per_kg_rate >= 0),
        free_above DECIMAL(12,2),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)
    await database.query(
      `CREATE INDEX IF NOT EXISTS idx_shipping_rates_zone ON shipping_rates(zone_id, is_active);`,
    )

    await addColumnIfMissing('vendor_orders', 'carrier', 'VARCHAR(60)')
    await addColumnIfMissing('vendor_orders', 'estimated_delivery', 'TIMESTAMP')
    await addColumnIfMissing('vendor_orders', 'shipped_at', 'TIMESTAMP')

    // ── Disputes & refunds ─────────────────────────────────────────────────
    await database.query(`
      CREATE TABLE IF NOT EXISTS order_disputes (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        vendor_order_id UUID REFERENCES vendor_orders(id) ON DELETE SET NULL,
        shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
        opened_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reason VARCHAR(40) NOT NULL
          CHECK (reason IN (
            'not_received','damaged','wrong_item','not_as_described','other'
          )),
        description TEXT NOT NULL,
        status VARCHAR(30) DEFAULT 'open'
          CHECK (status IN (
            'open','vendor_review','escalated','resolved','rejected','closed'
          )),
        resolution VARCHAR(40)
          CHECK (resolution IS NULL OR resolution IN (
            'full_refund','partial_refund','replacement','store_credit','none'
          )),
        refund_amount DECIMAL(12,2) DEFAULT 0,
        evidence JSONB DEFAULT '[]',
        vendor_response TEXT,
        admin_note TEXT,
        resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
        resolved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)
    await database.query(
      `CREATE INDEX IF NOT EXISTS idx_order_disputes_order ON order_disputes(order_id, status);`,
    )
    await database.query(
      `CREATE INDEX IF NOT EXISTS idx_order_disputes_shop ON order_disputes(shop_id, status);`,
    )

    await database.query(`
      CREATE TABLE IF NOT EXISTS order_refunds (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        dispute_id UUID REFERENCES order_disputes(id) ON DELETE SET NULL,
        amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
        status VARCHAR(30) DEFAULT 'pending'
          CHECK (status IN ('pending','processing','completed','failed','cancelled')),
        method VARCHAR(40) DEFAULT 'original',
        reason TEXT,
        processed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // ── Loyalty ────────────────────────────────────────────────────────────
    await database.query(`
      CREATE TABLE IF NOT EXISTS loyalty_accounts (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        points INT DEFAULT 0 CHECK (points >= 0),
        lifetime_points INT DEFAULT 0 CHECK (lifetime_points >= 0),
        tier VARCHAR(30) DEFAULT 'bronze'
          CHECK (tier IN ('bronze','silver','gold','platinum')),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await database.query(`
      CREATE TABLE IF NOT EXISTS loyalty_transactions (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
        points INT NOT NULL,
        type VARCHAR(30) NOT NULL
          CHECK (type IN ('earn','redeem','adjust','expire')),
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)
    await database.query(
      `CREATE INDEX IF NOT EXISTS idx_loyalty_tx_user ON loyalty_transactions(user_id, created_at DESC);`,
    )

    // ── Order risk flags ───────────────────────────────────────────────────
    await database.query(`
      CREATE TABLE IF NOT EXISTS order_risk_flags (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        score INT NOT NULL DEFAULT 0,
        level VARCHAR(20) DEFAULT 'low'
          CHECK (level IN ('low','medium','high','critical')),
        reasons JSONB DEFAULT '[]',
        reviewed BOOLEAN DEFAULT false,
        reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (order_id)
      );
    `)

    // ── Vendor-scoped promotions ───────────────────────────────────────────
    await addColumnIfMissing(
      'promotions',
      'shop_id',
      'UUID REFERENCES shops(id) ON DELETE CASCADE',
    )
    await addColumnIfMissing('promotions', 'starts_at', 'TIMESTAMP')
    await database.query(
      `CREATE INDEX IF NOT EXISTS idx_promotions_shop ON promotions(shop_id) WHERE shop_id IS NOT NULL;`,
    )

    // Compatibility columns used by older checkout code
    await addColumnIfMissing('promotions', 'discount_percent', 'DECIMAL(10,2)')
    await addColumnIfMissing('promotions', 'discount_amount', 'DECIMAL(10,2)')
    await addColumnIfMissing('promotions', 'expires_at', 'TIMESTAMP')

    await database.query(`
      CREATE TABLE IF NOT EXISTS promo_usage (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        promo_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
        order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // Order discount / loyalty columns for Phase 2 checkout
    await addColumnIfMissing(
      'orders',
      'discount_amount',
      'DECIMAL(12,2) DEFAULT 0 CHECK (discount_amount >= 0)',
    )
    await addColumnIfMissing('orders', 'promo_code', 'VARCHAR(50)')
    await addColumnIfMissing(
      'orders',
      'loyalty_discount',
      'DECIMAL(12,2) DEFAULT 0 CHECK (loyalty_discount >= 0)',
    )
    await addColumnIfMissing(
      'orders',
      'loyalty_points_used',
      'INT DEFAULT 0 CHECK (loyalty_points_used >= 0)',
    )

    // Seed default BD zones if empty
    const zoneCount = await database.query(`SELECT COUNT(*) FROM shipping_zones`)
    if (parseInt(zoneCount.rows[0].count) === 0) {
      const dhaka = await database.query(
        `INSERT INTO shipping_zones (name, cities, estimated_days_min, estimated_days_max)
         VALUES ('Dhaka Metro', ARRAY['dhaka','gazipur','narayanganj'], 1, 3)
         RETURNING id`,
      )
      const outside = await database.query(
        `INSERT INTO shipping_zones (name, cities, estimated_days_min, estimated_days_max)
         VALUES ('Rest of Bangladesh', ARRAY[]::TEXT[], 3, 7)
         RETURNING id`,
      )
      await database.query(
        `INSERT INTO shipping_rates (zone_id, carrier, name, base_rate, free_above) VALUES
         ($1, 'pathao', 'Pathao Courier', 60, 2000),
         ($1, 'steadfast', 'Steadfast', 70, 2500),
         ($2, 'sundarban', 'Sundarban Courier', 120, 3000),
         ($2, 'standard', 'Standard Delivery', 100, NULL)`,
        [dhaka.rows[0].id, outside.rows[0].id],
      )
      console.log('✅ Seeded default shipping zones/rates')
    }

    console.log('✅ Marketplace ops schema migration complete')
  } catch (error) {
    console.error('❌ Marketplace ops migration error:', error.message)
  }
}

export default migrateMarketplaceOpsSchema
