#!/usr/bin/env node
/**
 * Migration Runner
 * Executes database migrations including product schema and subcategories
 */

import { runProductsMigration } from './database-migration.js'

async function runMigration() {
  try {
    console.log('\n' + '='.repeat(60))
    console.log('🔄 Starting Database Migration')
    console.log('='.repeat(60))

    const result = await runProductsMigration()

    console.log('\n' + '='.repeat(60))
    if (result.status === 'success') {
      console.log('✅ Migration completed successfully!')
      console.log('='.repeat(60) + '\n')
      process.exit(0)
    } else if (result.status === 'partial') {
      console.log('⚠️  Migration completed with warnings')
      console.log('='.repeat(60) + '\n')
      process.exit(0)
    } else {
      console.log('❌ Migration failed')
      console.log('='.repeat(60) + '\n')
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Migration error:', error.message)
    process.exit(1)
  }
}

runMigration()
