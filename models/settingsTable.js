import db from '../database/db.js'

// Create settings table
export const createSettingsTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS settings (
      id SERIAL PRIMARY KEY,
      setting_key VARCHAR(255) UNIQUE NOT NULL,
      setting_value TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `
  try {
    await db.query(query)
    // Ensure legacy tables without the column get updated
    await db.query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS setting_value TEXT`)
    // Ensure legacy tables have the setting_key column as well
    await db.query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS setting_key VARCHAR(255)`)
    console.log('✅ Settings table created/verified')
  } catch (error) {
    console.error('❌ Error creating settings table:', error)
  }
}

// Create hero_slides table
export const createHeroSlidesTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS hero_slides (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      subtitle VARCHAR(255),
      description TEXT,
      image TEXT,
      cta VARCHAR(255),
      url VARCHAR(255),
      display_order INT DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `
  try {
    await db.query(query)
    console.log('✅ Hero slides table created/verified')
  } catch (error) {
    console.error('❌ Error creating hero slides table:', error)
  }
}

// Create featured_products table
export const createFeaturedProductsTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS featured_products (
      id SERIAL PRIMARY KEY,
      product_id UUID NOT NULL,
      display_order INT DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
  `
  try {
    await db.query(query)
    console.log('✅ Featured products table created/verified')
  } catch (error) {
    console.error('❌ Error creating featured products table:', error)
  }
}

// Get setting by key
export const getSetting = async (key) => {
  // Ensure the expected column exists; if not, try to create it.
  try {
    const colRes = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'settings'",
    )
    const cols = colRes.rows.map((r) => r.column_name)
    let valueCol = null
    if (cols.includes('setting_value')) valueCol = 'setting_value'
    else if (cols.includes('value')) valueCol = 'value'
    else if (cols.includes('setting')) valueCol = 'setting'
    // If none exist, add setting_value column
    if (!valueCol) {
      await db.query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS setting_value TEXT`)
      valueCol = 'setting_value'
    }

    const query = `SELECT ${valueCol} AS val FROM settings WHERE setting_key = $1`
    const result = await db.query(query, [key])
    if (result.rows.length > 0) {
      try {
        return JSON.parse(result.rows[0].val)
      } catch {
        return result.rows[0].val
      }
    }
    return null
  } catch (err) {
    // As a last resort, attempt legacy column names and return null on failure
    try {
      const fallback = await db.query('SELECT setting_value FROM settings WHERE setting_key = $1', [
        key,
      ])
      if (fallback.rows.length > 0) {
        try {
          return JSON.parse(fallback.rows[0].setting_value)
        } catch {
          return fallback.rows[0].setting_value
        }
      }
    } catch (e) {
      console.error('getSetting fallback failed:', e)
    }
    return null
  }
}

// Set setting
export const setSetting = async (key, value) => {
  try {
    const colRes = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'settings'",
    )
    const cols = colRes.rows.map((r) => r.column_name)
    if (!cols.includes('setting_value')) {
      await db.query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS setting_value TEXT`)
    }
    const query = `
      INSERT INTO settings (setting_key, setting_value)
      VALUES ($1, $2)
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2
    `
    const result = await db.query(query, [key, JSON.stringify(value)])
    return result
  } catch (err) {
    console.error('setSetting failed:', err)
    // Try a simple upsert using a generic column name as a fallback
    try {
      const fallbackQuery = `
        INSERT INTO settings (setting_key, setting_value)
        VALUES ($1, $2)
        ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2
      `
      return await db.query(fallbackQuery, [key, JSON.stringify(value)])
    } catch (e) {
      console.error('setSetting fallback failed:', e)
      throw e
    }
  }
}
