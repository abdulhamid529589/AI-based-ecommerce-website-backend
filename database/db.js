import pkg from 'pg'
const { Client } = pkg

import dotenv from 'dotenv'
dotenv.config()

console.log(process.env.DB_HOST)

const database = new Client({
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
})

// Handle connection errors
database.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err)
  // Attempt to reconnect
  setTimeout(() => {
    database.connect().catch((err) => console.error('Reconnection failed:', err))
  }, 5000)
})

try {
  await database.connect()
  console.log('Connected to the database successfully')
} catch (error) {
  console.error('Database connection failed:', error)
  process.exit(1)
}

export default database
