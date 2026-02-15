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
  const query = 'SELECT setting_value FROM settings WHERE setting_key = $1'
  const result = await db.query(query, [key])
  if (result.rows.length > 0) {
    try {
      return JSON.parse(result.rows[0].setting_value)
    } catch {
      return result.rows[0].setting_value
    }
  }
  return null
}

// Set setting
export const setSetting = async (key, value) => {
  const query = `
    INSERT INTO settings (setting_key, setting_value)
    VALUES ($1, $2)
    ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2
  `
  const result = await db.query(query, [key, JSON.stringify(value)])
  return result
}
