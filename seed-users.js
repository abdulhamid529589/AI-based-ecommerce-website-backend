import database from './database/db.js'
import bcrypt from 'bcrypt'

async function seedUsers() {
  try {
    // Admin user
    const adminEmail = 'admin@example.com'
    const adminPassword = 'adminPassword123'
    const hashedAdminPassword = await bcrypt.hash(adminPassword, 10)

    // Check if admin exists
    const adminExists = await database.query('SELECT id FROM users WHERE email = $1', [adminEmail])
    
    if (adminExists.rows.length === 0) {
      await database.query(
        'INSERT INTO users (email, password, role, created_at) VALUES ($1, $2, $3, $4)',
        [adminEmail, hashedAdminPassword, 'Admin', new Date()]
      )
      console.log('✅ Admin user created: admin@example.com / adminPassword123')
    } else {
      console.log('✅ Admin user already exists')
    }

    // Customer user
    const customerEmail = 'customer@example.com'
    const customerPassword = 'customerPassword123'
    const hashedCustomerPassword = await bcrypt.hash(customerPassword, 10)

    const customerExists = await database.query('SELECT id FROM users WHERE email = $1', [customerEmail])
    
    if (customerExists.rows.length === 0) {
      await database.query(
        'INSERT INTO users (email, password, role, created_at) VALUES ($1, $2, $3, $4)',
        [customerEmail, hashedCustomerPassword, 'Customer', new Date()]
      )
      console.log('✅ Customer user created: customer@example.com / customerPassword123')
    } else {
      console.log('✅ Customer user already exists')
    }

    console.log('\n🎉 User seeding complete!')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error seeding users:', error.message)
    process.exit(1)
  }
}

seedUsers()
