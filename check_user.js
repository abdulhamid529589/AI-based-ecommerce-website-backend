import database from './database/db.js'

async function test() {
  try {
    const result = await database.query(`
      SELECT * FROM users WHERE name = 'Abdul Hamid' LIMIT 1
    `)
    
    if (result.rows.length === 0) {
      console.log('❌ User "Abdul Hamid" not found')
    } else {
      const user = result.rows[0]
      console.log('\n👤 Abdul Hamid User Data:')
      console.log(JSON.stringify({
        id: user.id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        role_type: typeof user.role,
        role_length: user.role ? user.role.length : 0,
        role_bytes: user.role ? user.role.split('').map(c => c.charCodeAt(0)).join(',') : 'null',
      }, null, 2))
    }
    
    process.exit(0)
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

test()
