#!/usr/bin/env node
import dotenv from 'dotenv'
import bcrypt from 'bcrypt'

// Load project env from workspace root env file (falls back to .env)
dotenv.config({ path: './bedtexbangladesh-backend.env' })

// Import database after env is loaded
const { default: database } = await import('./database/db.js')

const argv = process.argv.slice(2)
const name = argv[0] || `Seed Vendor ${Date.now()}`
const email = argv[1] || `vendor_${Date.now()}@example.com`
const shopName = argv[2] || `${name} Shop`
// Generate a reasonably strong random password (at least 10 chars)
const password = argv[3] || `V${Math.random().toString(36).slice(2, 10)}A1!`

async function run() {
  try {
    console.log('Using DB config from environment')

    // Check if email exists
    const exists = await database.query('SELECT id, role FROM users WHERE email = $1', [email])
    if (exists.rows.length) {
      console.log('User already exists:', exists.rows[0])
      console.log('Email:', email)
      console.log('User ID:', exists.rows[0].id)
      process.exit(0)
    }

    const hashed = await bcrypt.hash(password, 10)

    const client = await database.connect()
    try {
      await client.query('BEGIN')

      const userRes = await client.query(
        `INSERT INTO users (name, email, password, role, created_at)
         VALUES ($1, $2, $3, 'Vendor', NOW()) RETURNING *`,
        [name, email, hashed],
      )

      const user = userRes.rows[0]

      // create shop and mark approved so vendor can use dashboard immediately
      const slug = shopName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')

      const shopRes = await client.query(
        `INSERT INTO shops (owner_id, name, slug, description, email, phone, city, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'approved', NOW()) RETURNING *`,
        [user.id, shopName, slug, null, email, null, null],
      )

      await client.query('COMMIT')

      console.log('✅ Vendor created successfully')
      console.log('User ID:', user.id)
      console.log('Email:', email)
      console.log('Password:', password)
      console.log('Shop ID:', shopRes.rows[0].id)
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    process.exit(0)
  } catch (error) {
    console.error('Error creating vendor:')
    console.error(error && error.stack ? error.stack : error)
    process.exit(1)
  }
}

run()
