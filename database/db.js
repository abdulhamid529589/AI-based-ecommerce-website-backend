import pkg from 'pg'
const { Pool } = pkg

import dotenv from 'dotenv'
dotenv.config()

// Validate required environment variables
if (!process.env.DB_PASSWORD) {
  throw new Error('DB_PASSWORD is not defined in environment variables')
}

const database = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'Mern_Ecommerce_Store',
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  // ✅ LOW FIX: Only disable certificate validation in development
  ssl:
    process.env.NODE_ENV === 'production'
      ? true
      : {
          rejectUnauthorized: false, // Allow self-signed certs in development only
        },
  statement_timeout: 30000, // 30 second timeout for queries
  connectionTimeoutMillis: 10000, // 10 second connection timeout
  idleTimeoutMillis: 30000, // 30 second idle timeout
  max: 20, // Maximum number of clients in the pool
})

// Handle pool errors
// ✅ HIGH FIX: Don't expose database errors in production logs
database.on('error', (err) => {
  if (process.env.NODE_ENV === 'development') {
    console.error('❌ Unexpected error on idle client in pool:', err.message)
  } else {
    // In production, log securely without exposing details
    console.error('❌ Database pool error occurred')
  }
})

// Test connection on startup (non-blocking)
database
  .connect()
  .then((client) => {
    console.log('✅ Connected to the database successfully')
    client.release()
  })
  .catch((error) => {
    console.error('⚠️ Database connection issue:', error.message)
    console.error('⚠️ Server will continue running, but database operations may fail')
  })

export default database
if (typeof module !== 'undefined' && module.exports) {
  module.exports = database
}
