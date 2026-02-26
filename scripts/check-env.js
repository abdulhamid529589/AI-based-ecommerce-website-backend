/**
 * Environment Variables Validator
 * Check if all required environment variables are set
 * Run with: npm run check:env
 */

const REQUIRED_VARS = [
  'DATABASE_URL',
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'PORT',
  'JWT_SECRET_KEY',
  'JWT_SECRET_KEY_ACCESS',
  'JWT_SECRET_KEY_REFRESH',
  'FRONTEND_URL',
  'DASHBOARD_URL',
]

const OPTIONAL_VARS = [
  'VITE_SOCKET_URL',
  'CLOUDINARY_CLIENT_NAME',
  'CLOUDINARY_CLIENT_API',
  'CLOUDINARY_CLIENT_SECRET',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_MAIL',
  'SMTP_PASSWORD',
  'GEMINI_API_KEY',
]

function checkEnv() {
  console.log('\n🔐 ENVIRONMENT VARIABLES CHECK')
  console.log('═══════════════════════════════════════════\n')

  let allGood = true
  const results = {
    required: { present: [], missing: [] },
    optional: { present: [], missing: [] },
  }

  // Check required variables
  console.log('📋 REQUIRED VARIABLES:')
  REQUIRED_VARS.forEach((varName) => {
    if (process.env[varName]) {
      const value =
        varName.includes('PASSWORD') || varName.includes('SECRET') ? '***' : process.env[varName]
      console.log(`   ✅ ${varName} = ${value}`)
      results.required.present.push(varName)
    } else {
      console.log(`   ❌ ${varName} = MISSING`)
      results.required.missing.push(varName)
      allGood = false
    }
  })

  console.log('\n📋 OPTIONAL VARIABLES:')
  OPTIONAL_VARS.forEach((varName) => {
    if (process.env[varName]) {
      const value =
        varName.includes('PASSWORD') || varName.includes('SECRET') ? '***' : process.env[varName]
      console.log(`   ✅ ${varName} = ${value}`)
      results.optional.present.push(varName)
    } else {
      console.log(`   ⚠️  ${varName} = not set`)
      results.optional.missing.push(varName)
    }
  })

  console.log('\n═══════════════════════════════════════════')
  console.log(`\n📊 SUMMARY:`)
  console.log(`   Required: ${results.required.present.length}/${REQUIRED_VARS.length} ✅`)
  console.log(`   Optional: ${results.optional.present.length}/${OPTIONAL_VARS.length}`)

  if (allGood) {
    console.log('\n✅ All required environment variables are set!\n')
    process.exit(0)
  } else {
    console.log('\n❌ MISSING REQUIRED VARIABLES!')
    console.log('\n⚠️  Set these on Render:')
    results.required.missing.forEach((v) => console.log(`   - ${v}`))
    console.log()
    process.exit(1)
  }
}

checkEnv()
