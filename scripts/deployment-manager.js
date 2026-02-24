#!/usr/bin/env node
/**
 * E-Commerce Deployment Manager
 *
 * Provides CLI commands for:
 * - Database migrations
 * - Deployment checks
 * - Environment verification
 * - Troubleshooting
 *
 * Usage: node scripts/deployment-manager.js [command]
 * Commands:
 *   migrate        - Run database migrations
 *   check          - Check deployment readiness
 *   verify-env     - Verify environment variables
 *   backup         - Create database backup
 *   status         - Check deployment status
 *   help           - Show this help message
 */

import database from '../database/db.js'
import { runProductsMigration, getMigrationInfo } from './database-migration.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function logSuccess(message) {
  console.log(`${colors.green}✅${colors.reset} ${message}`)
}

function logError(message) {
  console.log(`${colors.red}❌${colors.reset} ${message}`)
}

function logWarning(message) {
  console.log(`${colors.yellow}⚠️${colors.reset}  ${message}`)
}

function logInfo(message) {
  console.log(`${colors.blue}ℹ️${colors.reset}  ${message}`)
}

/**
 * Migrate command - Run database migrations
 */
async function commandMigrate() {
  log('\n🔄 Running Database Migration\n', 'cyan')

  try {
    const result = await runProductsMigration()

    if (result.status === 'success') {
      logSuccess(`Migration completed successfully`)
      console.log(`   • Added columns: ${result.details.added}`)
      console.log(`   • Existing columns: ${result.details.existing}`)
      console.log(`   • Total: ${result.details.total}/${getMigrationInfo().totalColumns}`)
    } else if (result.status === 'partial') {
      logWarning(`Migration completed with errors`)
      console.log(`   • Added columns: ${result.details.added}`)
      console.log(`   • Errors: ${result.details.errors}`)
    } else {
      logError(`Migration failed: ${result.message}`)
    }

    process.exit(result.status === 'success' ? 0 : 1)
  } catch (error) {
    logError(`Migration error: ${error.message}`)
    process.exit(1)
  }
}

/**
 * Check command - Check deployment readiness
 */
async function commandCheck() {
  log('\n🔍 Deployment Readiness Check\n', 'cyan')

  let checksPass = true

  // Check 1: Node.js version
  const nodeVersion = process.version
  logSuccess(`Node.js ${nodeVersion}`)

  // Check 2: Environment variables
  console.log('\n📋 Environment Variables:')
  const required = ['DATABASE_URL', 'JWT_SECRET']
  const optional = ['NODE_ENV', 'CORS_ORIGIN', 'PORT']

  for (const envVar of required) {
    if (process.env[envVar]) {
      logSuccess(`${envVar} is set`)
    } else {
      logError(`${envVar} is missing (REQUIRED)`)
      checksPass = false
    }
  }

  for (const envVar of optional) {
    if (process.env[envVar]) {
      logSuccess(`${envVar} = ${process.env[envVar]}`)
    } else {
      logWarning(`${envVar} is not set (optional)`)
    }
  }

  // Check 3: Database connection
  console.log('\n🗄️  Database Connection:')
  try {
    const result = await database.query('SELECT NOW()')
    logSuccess(`Connected to database`)
    console.log(`   • Time: ${result.rows[0].now}`)
  } catch (error) {
    logError(`Cannot connect to database: ${error.message}`)
    checksPass = false
  }

  // Check 4: Products table status
  console.log('\n📊 Products Table Status:')
  try {
    const result = await database.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'products' AND table_schema = 'public'
    `)
    const columns = result.rows.length
    const info = getMigrationInfo()
    logSuccess(`Found ${columns}/${info.totalColumns} columns`)

    if (columns < info.criticalColumns) {
      logWarning(`Missing critical columns (${info.criticalColumns} required)`)
    }
  } catch (error) {
    logWarning(`Products table not found (will be created on startup)`)
  }

  // Summary
  console.log('\n' + '='.repeat(50))
  if (checksPass) {
    logSuccess(`✓ All checks passed! Ready for deployment.`)
  } else {
    logError(`✗ Some checks failed. Fix issues before deploying.`)
  }
  console.log('='.repeat(50) + '\n')

  process.exit(checksPass ? 0 : 1)
}

/**
 * Verify environment command
 */
async function commandVerifyEnv() {
  log('\n✔️  Environment Variables Verification\n', 'cyan')

  const envFile = path.join(__dirname, '../.env')
  const envExampleFile = path.join(__dirname, '../.env.example')

  if (fs.existsSync(envFile)) {
    logSuccess(`.env file found`)
  } else {
    logWarning(`.env file not found`)
    if (fs.existsSync(envExampleFile)) {
      logInfo(`Copy .env.example to .env and fill in values:`)
      console.log(`   cp .env.example .env`)
    }
  }

  const criticalVars = ['DATABASE_URL', 'JWT_SECRET', 'NODE_ENV']
  const missing = criticalVars.filter((v) => !process.env[v])

  if (missing.length === 0) {
    logSuccess(`All critical variables are set`)
  } else {
    logError(`Missing critical variables: ${missing.join(', ')}`)
  }

  console.log('\nVariables currently set:')
  for (const [key, value] of Object.entries(process.env)) {
    if (
      key.includes('DATABASE') ||
      key.includes('JWT') ||
      key.includes('CORS') ||
      key.includes('NODE')
    ) {
      const displayValue = key === 'DATABASE_URL' ? '***' : value
      console.log(`   ${key} = ${displayValue}`)
    }
  }

  console.log()
  process.exit(missing.length === 0 ? 0 : 1)
}

/**
 * Backup command - Create database backup
 */
async function commandBackup() {
  log('\n💾 Creating Database Backup\n', 'cyan')

  if (!process.env.DATABASE_URL) {
    logError(`DATABASE_URL not set`)
    process.exit(1)
  }

  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0]
  const backupFile = `backup_${timestamp}.sql`

  logInfo(`Creating backup: ${backupFile}`)
  logWarning(`This requires 'pg_dump' to be installed`)

  // For Node.js, we can use psql command
  const { execSync } = await import('child_process')

  try {
    execSync(`pg_dump "${process.env.DATABASE_URL}" > ${backupFile}`, {
      stdio: 'inherit',
    })
    logSuccess(`Backup created: ${backupFile}`)
  } catch (error) {
    logError(`Backup failed: ${error.message}`)
    logInfo(`Manual backup command:`)
    console.log(`   pg_dump "${process.env.DATABASE_URL}" > ${backupFile}`)
    process.exit(1)
  }

  process.exit(0)
}

/**
 * Status command - Check current deployment status
 */
async function commandStatus() {
  log('\n📊 Deployment Status Report\n', 'cyan')

  console.log('Environment:')
  console.log(`   • Node: ${process.version}`)
  console.log(`   • Platform: ${process.platform}`)
  console.log(`   • Uptime: ${Math.floor(process.uptime())}s`)
  console.log(`   • Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`)

  console.log('\nDeployment Info:')
  console.log(`   • Render: ${process.env.RENDER ? 'Yes' : 'No'}`)
  console.log(`   • Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`   • Port: ${process.env.PORT || 5000}`)

  console.log('\nDatabase:')
  try {
    const dbCheck = await database.query('SELECT COUNT(*) FROM products')
    logSuccess(`Connected to database`)
    console.log(`   • Products: ${dbCheck.rows[0].count}`)
  } catch (error) {
    logWarning(`Database not available`)
  }

  console.log()
  process.exit(0)
}

/**
 * Help command
 */
function commandHelp() {
  log('\n🆘 E-Commerce Deployment Manager\n', 'cyan')

  console.log('Usage: node scripts/deployment-manager.js [command]\n')

  console.log('Commands:')
  console.log('  migrate        Run database migrations')
  console.log('  check          Check deployment readiness')
  console.log('  verify-env     Verify environment variables')
  console.log('  backup         Create database backup')
  console.log('  status         Check deployment status')
  console.log('  help           Show this message\n')

  console.log('Examples:')
  console.log('  npm run db:migrate')
  console.log('  node scripts/deployment-manager.js check')
  console.log('  node scripts/deployment-manager.js verify-env\n')

  process.exit(0)
}

/**
 * Main CLI handler
 */
async function main() {
  const command = process.argv[2] || 'help'

  try {
    switch (command) {
      case 'migrate':
        await commandMigrate()
        break
      case 'check':
        await commandCheck()
        break
      case 'verify-env':
        await commandVerifyEnv()
        break
      case 'backup':
        await commandBackup()
        break
      case 'status':
        await commandStatus()
        break
      case 'help':
      case '-h':
      case '--help':
        commandHelp()
        break
      default:
        logError(`Unknown command: ${command}`)
        commandHelp()
    }
  } catch (error) {
    logError(`Error: ${error.message}`)
    process.exit(1)
  }
}

// Run CLI
main()
