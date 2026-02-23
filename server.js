import http from 'http'
import app from './app.js'
import { v2 as cloudinary } from 'cloudinary'
import initializeDatabase from './database/alterUsersTable.js'
import { initializeSentry } from './utils/sentryIntegration.js'
import { initializeIdempotencyCleanup } from './utils/idempotencyKey.js'
import { createPerformanceIndexes } from './utils/performanceOptimizations.js'
import { initializeSocket } from './socket/socketSetup.js'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLIENT_NAME,
  api_key: process.env.CLOUDINARY_CLIENT_API,
  api_secret: process.env.CLOUDINARY_CLIENT_SECRET,
})

// Validate payment gateway credentials on startup
// Note: Stripe removed - Bangladeshi website uses bKash, Nagad, Rocket, and COD only
const requiredEnvVars = [
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

// Initialize Sentry (if configured)
await initializeSentry()

// Initialize database schema on startup
await initializeDatabase()

// 🚀 Create performance indexes for optimal query speed
await createPerformanceIndexes()

// Initialize idempotency cleanup routine
initializeIdempotencyCleanup()

// Create HTTP server for Socket.io support
const httpServer = http.createServer(app)

// Initialize Socket.io for real-time updates
const io = initializeSocket(httpServer)

// Make io available globally for other modules
app.set('io', io)

httpServer.listen(process.env.PORT, () => {
  console.log(`✅ Server is running on port ${process.env.PORT}`)
  console.log(`🚀 Performance optimizations enabled (compression, indexing, caching)`)
  console.log(`🔌 Socket.io enabled for real-time updates`)
})
