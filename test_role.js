import database from './database/db.js'

async function test() {
  try {
    // Get admin users
    const result = await database.query(`
      SELECT id, name, email, mobile, role, created_at 
      FROM users 
      WHERE role = 'Admin' 
      LIMIT 5
    `)
    
    console.log('\n👤 Admin Users:')
    if (result.rows.length === 0) {
      console.log('❌ No admin users found in database')
    } else {
      result.rows.forEach(user => {
        console.log(`  - ${user.name} (${user.email || user.mobile}): role="${user.role}" (type: ${typeof user.role})`)
      })
    }
    
    // Check table structure
    const columns = await database.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position
    `)
    
    console.log('\n📋 Users Table Columns:')
    columns.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`)
    })
    
    process.exit(0)
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

test()
