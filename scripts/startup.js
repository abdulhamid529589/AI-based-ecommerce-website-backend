#!/usr/bin/env node
/**
 * Enhanced Startup Script for Render Deployment
 *
 * This script:
 * 1. Waits for database connection with retry logic
 * 2. Runs automatic migrations
 * 3. Initializes tables
 * 4. Starts the Express server
 *
 * Run with: npm start
 */

import database from '../database/db.js'
import app from '../app.js'
import { runProductsMigration, getMigrationInfo } from './database-migration.js'

const PORT = process.env.PORT || 5000
const MAX_RETRIES = 10
const RETRY_DELAY = 2000 // 2 seconds

/**
 * Wait for database connection with retry logic
 */
async function waitForDatabase(attempt = 1) {
  try {
    const result = await database.query('SELECT NOW()')
    console.log('✅ Connected to the database successfully')
    return true
  } catch (error) {
    if (attempt < MAX_RETRIES) {
      const waitTime = (attempt * RETRY_DELAY) / 1000
      console.warn(
        `⏳ Database not ready. Retrying in ${waitTime}s... (attempt ${attempt}/${MAX_RETRIES})`,
      )
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY))
      return waitForDatabase(attempt + 1)
    } else {
      console.error(
        '❌ Could not connect to database after',
        MAX_RETRIES,
        'attempts:',
        error.message,
      )
      return false
    }
  }
}

/**
 * Initialize and migrate database
 */
async function initializeDatabase() {
  try {
    console.log('\n🔄 [STARTUP] Running database initialization...')

    // Run products table migration
    const migrationResult = await runProductsMigration()

    if (migrationResult.status === 'error') {
      console.error('❌ [STARTUP] Critical migration error:', migrationResult.message)
      // Continue anyway - tables might be created by app
    } else {
      console.log('✅ [STARTUP] Database migration completed:', migrationResult.status)
    }

    // Let the app create remaining tables
    console.log('📊 [STARTUP] Tables will be created/verified by the application...')
    return true
  } catch (error) {
    console.error('❌ [STARTUP] Database initialization error:', error.message)
    return false
  }
}

/**
 * Main startup sequence
 */
async function startServer() {
  try {
    console.log('\n' + '='.repeat(60))
    console.log('🚀 [STARTUP] Starting E-Commerce Server')
    console.log('='.repeat(60))

    // Environment info
    console.log('\n📝 [STARTUP] Environment Configuration:')
    console.log(`   • Node Environment: ${process.env.NODE_ENV || 'development'}`)
    console.log(`   • Port: ${PORT}`)
    console.log(`   • Database Host: ${process.env.DATABASE_URL ? 'Configured' : 'Not configured'}`)
    console.log(`   • Deployment Platform: ${process.env.RENDER ? 'Render' : 'Local/Other'}`)

    // Get migration info
    const migrationInfo = getMigrationInfo()
    console.log('\n📦 [STARTUP] Database Schema Information:')
    console.log(`   • Total columns to manage: ${migrationInfo.totalColumns}`)
    console.log(`   • Critical columns: ${migrationInfo.criticalColumns}`)
    console.log(`   • Enhanced columns: ${migrationInfo.enhancedColumns}`)

    // Step 1: Wait for database
    console.log('\n⏳ [STARTUP] Waiting for database connection...')
    const dbReady = await waitForDatabase()

    if (!dbReady) {
      console.error('❌ [STARTUP] Failed to connect to database')
      process.exit(1)
    }

    // Step 2: Initialize database
    console.log('\n🔧 [STARTUP] Initializing database schema...')
    const initSuccess = await initializeDatabase()

    if (!initSuccess) {
      console.warn('⚠️  [STARTUP] Database initialization had issues, but continuing...')
    }

    // Step 3: Start the server
    console.log('\n🌐 [STARTUP] Starting Express server...')
    const server = app.listen(PORT, () => {
      console.log('='.repeat(60))
      console.log(`✅ [STARTUP] Server is running on port ${PORT}`)
      console.log(`📍 URL: http://localhost:${PORT}`)
      console.log('='.repeat(60))
      console.log('\n✨ Server ready to accept requests!\n')
    })

    // Graceful shutdown handling
    process.on('SIGTERM', () => {
      console.log('\n📛 [SHUTDOWN] SIGTERM signal received: closing HTTP server')
      server.close(() => {
        console.log('✅ HTTP server closed')
        process.exit(0)
      })
    })

    process.on('SIGINT', () => {
      console.log('\n📛 [SHUTDOWN] SIGINT signal received: closing HTTP server')
      server.close(() => {
        console.log('✅ HTTP server closed')
        process.exit(0)
      })
    })

    // Unhandled promise rejection handler
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ [ERROR] Unhandled Rejection at:', promise, 'reason:', reason)
    })

    // Uncaught exception handler
    process.on('uncaughtException', (error) => {
      console.error('❌ [ERROR] Uncaught Exception:', error)
      // Don't exit - try to recover
    })
  } catch (error) {
    console.error('❌ [STARTUP] Fatal error during startup:', error)
    process.exit(1)
  }
}

// Start the server
startServer()
