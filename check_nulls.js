import database from './database/db.js'

async function test() {
  try {
    const result = await database.query(`
      SELECT COUNT(*) as total, 
             COUNT(role) as with_role, 
             COUNT(*) - COUNT(role) as with_null_role
      FROM users
    `)
    
    console.log('\n📊 Role Column Status:')
    console.log(`  Total users: ${result.rows[0].total}`)
    console.log(`  Users with role: ${result.rows[0].with_role}`)
    console.log(`  Users with NULL role: ${result.rows[0].with_null_role}`)
    
    if (result.rows[0].with_null_role > 0) {
      console.log('\n❌ FOUND USERS WITH NULL ROLE - This is the problem!')
      const nullUsers = await database.query(`SELECT id, name, email, mobile FROM users WHERE role IS NULL LIMIT 10`)
      console.log('  First 10 users with NULL role:')
      nullUsers.rows.forEach(u => console.log(`    - ${u.name} (${u.email || u.mobile})`))
    }
    
    process.exit(0)
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

test()
