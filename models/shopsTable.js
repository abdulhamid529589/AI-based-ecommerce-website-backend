import database from '../database/db.js'

/**
 * Multi-vendor shops (seller storefronts).
 * One approved shop per vendor user. Platform Admin manages approval & commissions.
 */
export async function createShopsTable() {
  try {
    await database.query(`
      CREATE TABLE IF NOT EXISTS shops (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        owner_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(120) NOT NULL CHECK (char_length(name) >= 2),
        slug VARCHAR(140) NOT NULL UNIQUE,
        description TEXT,
        logo JSONB DEFAULT NULL,
        banner JSONB DEFAULT NULL,
        email VARCHAR(120),
        phone VARCHAR(30),
        address TEXT,
        city VARCHAR(80),
        country VARCHAR(80) DEFAULT 'Bangladesh',
        status VARCHAR(20) DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'suspended', 'rejected')),
        commission_rate DECIMAL(5,2) DEFAULT 10.00
          CHECK (commission_rate >= 0 AND commission_rate <= 100),
        rating DECIMAL(3,2) DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
        total_sales INT DEFAULT 0,
        total_orders INT DEFAULT 0,
        product_count INT DEFAULT 0,
        is_verified BOOLEAN DEFAULT false,
        payout_method VARCHAR(40) DEFAULT 'bkash',
        payout_account VARCHAR(120),
        rejection_reason TEXT,
        approved_at TIMESTAMP,
        approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await database.query(`CREATE INDEX IF NOT EXISTS idx_shops_slug ON shops(slug);`)
    await database.query(`CREATE INDEX IF NOT EXISTS idx_shops_status ON shops(status);`)
    await database.query(`CREATE INDEX IF NOT EXISTS idx_shops_owner ON shops(owner_id);`)
    console.log('✅ Shops table ready')
  } catch (error) {
    console.error('❌ Failed to create shops table:', error.message)
  }
}

export async function createVendorOrdersTable() {
  try {
    await database.query(`
      CREATE TABLE IF NOT EXISTS vendor_orders (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
        subtotal DECIMAL(12,2) NOT NULL CHECK (subtotal >= 0),
        shipping_share DECIMAL(12,2) DEFAULT 0 CHECK (shipping_share >= 0),
        tax_share DECIMAL(12,2) DEFAULT 0 CHECK (tax_share >= 0),
        commission_rate DECIMAL(5,2) NOT NULL DEFAULT 10.00,
        commission_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        vendor_earning DECIMAL(12,2) NOT NULL DEFAULT 0,
        status VARCHAR(50) DEFAULT 'Processing'
          CHECK (status IN ('Processing', 'Shipped', 'Delivered', 'Cancelled')),
        payout_status VARCHAR(30) DEFAULT 'pending'
          CHECK (payout_status IN ('pending', 'eligible', 'paid', 'held')),
        tracking_number VARCHAR(100),
        vendor_note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (order_id, shop_id)
      );
    `)

    await database.query(
      `CREATE INDEX IF NOT EXISTS idx_vendor_orders_shop ON vendor_orders(shop_id, status);`,
    )
    await database.query(
      `CREATE INDEX IF NOT EXISTS idx_vendor_orders_order ON vendor_orders(order_id);`,
    )
    console.log('✅ Vendor orders table ready')
  } catch (error) {
    console.error('❌ Failed to create vendor_orders table:', error.message)
  }
}

export async function createVendorPayoutsTable() {
  try {
    await database.query(`
      CREATE TABLE IF NOT EXISTS vendor_payouts (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
        currency VARCHAR(10) DEFAULT 'BDT',
        status VARCHAR(30) DEFAULT 'pending'
          CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
        method VARCHAR(40),
        account_ref VARCHAR(120),
        period_start TIMESTAMP,
        period_end TIMESTAMP,
        notes TEXT,
        processed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await database.query(
      `CREATE INDEX IF NOT EXISTS idx_vendor_payouts_shop ON vendor_payouts(shop_id, status);`,
    )
    console.log('✅ Vendor payouts table ready')
  } catch (error) {
    console.error('❌ Failed to create vendor_payouts table:', error.message)
  }
}

/**
 * Migrate existing schema for multi-vendor:
 * - Expand user roles to include Vendor
 * - Add shop_id on products & order_items
 * - Link order_items to vendor_orders
 */
export async function migrateMultiVendorSchema() {
  try {
    // Expand role CHECK to include Vendor (drop old constraint if present)
    await database.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'users_role_check' AND conrelid = 'users'::regclass
        ) THEN
          ALTER TABLE users DROP CONSTRAINT users_role_check;
        END IF;
      END $$;
    `)
    await database.query(`
      ALTER TABLE users
      ADD CONSTRAINT users_role_check
      CHECK (role IN ('User', 'Vendor', 'Admin'));
    `)

    // Widen role column if needed (Vendor is same length as Admin)
    await database.query(`
      ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(20);
    `)

    // products.shop_id
    const productShopCol = await database.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'products' AND column_name = 'shop_id'
    `)
    if (productShopCol.rows.length === 0) {
      await database.query(`
        ALTER TABLE products
        ADD COLUMN shop_id UUID REFERENCES shops(id) ON DELETE SET NULL;
      `)
      await database.query(`CREATE INDEX IF NOT EXISTS idx_products_shop ON products(shop_id);`)
      console.log('✅ Added shop_id to products')
    }

    // order_items.shop_id + vendor_order_id
    const oiShopCol = await database.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'order_items' AND column_name = 'shop_id'
    `)
    if (oiShopCol.rows.length === 0) {
      await database.query(`
        ALTER TABLE order_items
        ADD COLUMN shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
        ADD COLUMN vendor_order_id UUID REFERENCES vendor_orders(id) ON DELETE SET NULL;
      `)
      await database.query(
        `CREATE INDEX IF NOT EXISTS idx_order_items_shop ON order_items(shop_id);`,
      )
      console.log('✅ Added shop_id / vendor_order_id to order_items')
    }

    console.log('✅ Multi-vendor schema migration complete')
  } catch (error) {
    console.error('❌ Multi-vendor migration error:', error.message)
  }
}

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
 * Phase 1A: KYC fields, wallet balance, KYC docs, wallet ledger,
 * payout line items, inventory reservations.
 */
export async function migratePhase1ASchema() {
  try {
    await addColumnIfMissing(
      'shops',
      'kyc_status',
      `VARCHAR(30) DEFAULT 'not_submitted'`,
    )
    await addColumnIfMissing('shops', 'business_name', 'VARCHAR(160)')
    await addColumnIfMissing('shops', 'nid_number', 'VARCHAR(40)')
    await addColumnIfMissing('shops', 'trade_license_number', 'VARCHAR(80)')
    await addColumnIfMissing('shops', 'bank_name', 'VARCHAR(120)')
    await addColumnIfMissing('shops', 'bank_account_name', 'VARCHAR(120)')
    await addColumnIfMissing('shops', 'bank_account_number', 'VARCHAR(60)')
    await addColumnIfMissing('shops', 'bank_routing_number', 'VARCHAR(40)')
    await addColumnIfMissing('shops', 'kyc_submitted_at', 'TIMESTAMP')
    await addColumnIfMissing('shops', 'kyc_reviewed_at', 'TIMESTAMP')
    await addColumnIfMissing(
      'shops',
      'kyc_reviewed_by',
      'UUID REFERENCES users(id) ON DELETE SET NULL',
    )
    await addColumnIfMissing('shops', 'kyc_rejection_reason', 'TEXT')
    await addColumnIfMissing(
      'shops',
      'wallet_balance',
      'DECIMAL(12,2) DEFAULT 0 CHECK (wallet_balance >= 0)',
    )

    // Soft-enforce kyc_status enum via check (ignore if already exists)
    await database.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'shops_kyc_status_check'
        ) THEN
          ALTER TABLE shops ADD CONSTRAINT shops_kyc_status_check
            CHECK (kyc_status IN ('not_submitted','pending','approved','rejected'));
        END IF;
      END $$;
    `)

    await database.query(`
      CREATE TABLE IF NOT EXISTS shop_kyc_documents (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        doc_type VARCHAR(40) NOT NULL
          CHECK (doc_type IN ('nid_front','nid_back','trade_license','selfie','bank_proof','other')),
        file JSONB NOT NULL,
        status VARCHAR(20) DEFAULT 'pending'
          CHECK (status IN ('pending','approved','rejected')),
        notes TEXT,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP,
        reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL
      );
    `)
    await database.query(
      `CREATE INDEX IF NOT EXISTS idx_shop_kyc_docs_shop ON shop_kyc_documents(shop_id, status);`,
    )

    await database.query(`
      CREATE TABLE IF NOT EXISTS vendor_wallet_transactions (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        vendor_order_id UUID REFERENCES vendor_orders(id) ON DELETE SET NULL,
        payout_id UUID REFERENCES vendor_payouts(id) ON DELETE SET NULL,
        type VARCHAR(30) NOT NULL
          CHECK (type IN ('earning_credit','payout_debit','payout_reversal','adjustment','refund_debit')),
        amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
        direction VARCHAR(10) NOT NULL CHECK (direction IN ('credit','debit')),
        balance_after DECIMAL(12,2) NOT NULL,
        note TEXT,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)
    await database.query(
      `CREATE INDEX IF NOT EXISTS idx_vendor_wallet_shop ON vendor_wallet_transactions(shop_id, created_at DESC);`,
    )
    await database.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_wallet_earning_once
      ON vendor_wallet_transactions(vendor_order_id)
      WHERE type = 'earning_credit' AND vendor_order_id IS NOT NULL;
    `)

    await database.query(`
      CREATE TABLE IF NOT EXISTS vendor_payout_items (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        payout_id UUID NOT NULL REFERENCES vendor_payouts(id) ON DELETE CASCADE,
        vendor_order_id UUID NOT NULL REFERENCES vendor_orders(id) ON DELETE RESTRICT,
        amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
        UNIQUE (payout_id, vendor_order_id)
      );
    `)

    await database.query(`
      CREATE TABLE IF NOT EXISTS inventory_reservations (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity INT NOT NULL CHECK (quantity > 0),
        status VARCHAR(20) DEFAULT 'active'
          CHECK (status IN ('active','committed','released','expired')),
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (order_id, product_id)
      );
    `)
    await database.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_reservations_active
      ON inventory_reservations(product_id, status, expires_at);
    `)

    console.log('✅ Phase 1A schema migration complete')
  } catch (error) {
    console.error('❌ Phase 1A migration error:', error.message)
  }
}
