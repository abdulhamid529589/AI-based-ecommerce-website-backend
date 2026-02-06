import pkg from 'pg'
const { Pool } = pkg

import dotenv from 'dotenv'
dotenv.config()

console.log(process.env.DB_HOST)

const database = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'Mern_Ecommerce_Store',
  password: process.env.DB_PASSWORD || 'patanehi',
  port: process.env.DB_PORT || 5432,
  ssl: {
    required: true,
    rejectUnauthorized: false,
  },
  statement_timeout: 30000, // 30 second timeout for queries
  connectionTimeoutMillis: 10000, // 10 second connection timeout
  idleTimeoutMillis: 30000, // 30 second idle timeout
  max: 20, // Maximum number of clients in the pool
})

// Handle pool errors
database.on('error', (err) => {
  console.error('❌ Unexpected error on idle client in pool:', err.message)
})

// Test connection on startup
try {
  const client = await database.connect()
  console.log('Connected to the database successfully')
  client.release()
} catch (error) {
  console.error('Database connection failed:', error.message)
  process.exit(1)
}

export default database
