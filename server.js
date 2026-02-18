import app from './app.js'
import { v2 as cloudinary } from 'cloudinary'
import initializeDatabase from './database/alterUsersTable.js'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLIENT_NAME,
  api_key: process.env.CLOUDINARY_CLIENT_API,
  api_secret: process.env.CLOUDINARY_CLIENT_SECRET,
})

// Validate payment gateway credentials on startup
const requiredEnvVars = [
  'STRIPE_API_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'BKASH_APP_KEY',
  'BKASH_APP_SECRET',
  'BKASH_BASE_URL',
  'NAGAD_APP_KEY',
  'NAGAD_APP_SECRET',
  'ROCKET_APP_KEY',
  'ROCKET_APP_SECRET',
]

const missingVars = requiredEnvVars.filter((v) => !process.env[v])

if (missingVars.length > 0) {
  console.warn('⚠️  Missing payment gateway environment variables:')
  missingVars.forEach((v) => console.warn(`   - ${v}`))
  console.warn('⚠️  Payment gateways may not work without these credentials!')
} else {
  console.log('✅ All payment gateway credentials configured')
}

// Initialize database schema on startup
await initializeDatabase()

app.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`)
})
