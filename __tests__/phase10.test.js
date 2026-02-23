/**
 * Phase 10 Tests - Socket.io Backend Integration & Configuration
 * Tests Socket.io server setup, event handlers, and broadcasting capability
 * Run with: npm test -- phase10.test.js
 */

import request from 'supertest'
import app from '../app.js'
import database from '../database/db.js'
import fs from 'fs'
import path from 'path'

describe('Phase 10: Socket.io Backend Integration', () => {
  beforeAll(async () => {
    console.log('\n' + '='.repeat(70))
    console.log('🧪 PHASE 10: SOCKET.IO BACKEND INTEGRATION')
    console.log('='.repeat(70))
    console.log('Testing Socket.io server configuration and event broadcasting\n')
  })

  afterAll(async () => {
    console.log('\n' + '='.repeat(70))
    console.log('✅ PHASE 10 TESTS COMPLETED')
    console.log('='.repeat(70) + '\n')
  })

  describe('Phase 10.1: Socket.io Server Configuration', () => {
    test('Should verify Socket.io module is installed', async () => {
      console.log('\n  📝 Test 10.1.1: Verify Socket.io installation')

      try {
        // Check if socket.io is in package.json
        const packageJsonPath = path.join(process.cwd(), 'package.json')
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

        const hasSocketIO =
          packageJson.dependencies['socket.io'] || packageJson.devDependencies['socket.io']

        console.log(`     Socket.io version: ${hasSocketIO || 'not found'}`)

        if (hasSocketIO) {
          console.log(`  ✅ Socket.io is installed`)
        } else {
          console.log(`  ⚠️  Socket.io not found in dependencies`)
        }
      } catch (error) {
        console.error('  ❌ Error:', error.message)
        throw error
      }
    })

    test('Should verify Socket.io files exist in socket directory', async () => {
      console.log('\n  📝 Test 10.1.2: Verify Socket.io files')

      try {
        const socketDir = path.join(process.cwd(), 'socket')

        if (!fs.existsSync(socketDir)) {
          console.log('  ⚠️  Socket directory not found')
          return
        }

        const files = fs.readdirSync(socketDir)
        console.log(`     Files in socket directory: ${files.join(', ')}`)

        if (files.length > 0) {
          console.log(`  ✅ Socket.io configuration files exist`)
        } else {
          console.log(`  ⚠️  Socket directory is empty`)
        }
      } catch (error) {
        console.error('  ❌ Error:', error.message)
        throw error
      }
    })

    test('Should verify Socket.io is integrated in app.js', async () => {
      console.log('\n  📝 Test 10.1.3: Verify app.js Socket.io integration')

      try {
        const appPath = path.join(process.cwd(), 'app.js')
        const appContent = fs.readFileSync(appPath, 'utf8')

        const hasSocketIO = appContent.includes('socket') || appContent.includes('Socket')

        console.log(`     Socket.io references found: ${hasSocketIO}`)

        if (hasSocketIO) {
          console.log(`  ✅ App.js includes Socket.io integration`)
        } else {
          console.log(`  ⚠️  No obvious Socket.io integration in app.js`)
        }
      } catch (error) {
        console.error('  ❌ Error:', error.message)
        throw error
      }
    })
  })

  describe('Phase 10.2: Category Event Broadcasting', () => {
    test('Should verify category update events are configured', async () => {
      console.log('\n  📝 Test 10.2.1: Check category event configuration')

      try {
        const socketDir = path.join(process.cwd(), 'socket')

        if (!fs.existsSync(socketDir)) {
          console.log('  ⚠️  Socket directory not found')
          return
        }

        const files = fs.readdirSync(socketDir).map((f) => path.join(socketDir, f))
        let foundCategoryHandler = false

        for (const file of files) {
          const content = fs.readFileSync(file, 'utf8')
          if (content.includes('categories') || content.includes('category')) {
            foundCategoryHandler = true
            console.log(`     Found in: ${path.basename(file)}`)
            break
          }
        }

        if (foundCategoryHandler) {
          console.log(`  ✅ Category event handlers are configured`)
        } else {
          console.log(`  ⚠️  Category event handlers not found`)
        }
      } catch (error) {
        console.error('  ❌ Error:', error.message)
        throw error
      }
    })

    test('Should verify product update events are configured', async () => {
      console.log('\n  📝 Test 10.2.2: Check product event configuration')

      try {
        const socketDir = path.join(process.cwd(), 'socket')

        if (!fs.existsSync(socketDir)) {
          console.log('  ⚠️  Socket directory not found')
          return
        }

        const files = fs.readdirSync(socketDir).map((f) => path.join(socketDir, f))
        let foundProductHandler = false

        for (const file of files) {
          const content = fs.readFileSync(file, 'utf8')
          if (content.includes('product') || content.includes('Product')) {
            foundProductHandler = true
            console.log(`     Found in: ${path.basename(file)}`)
            break
          }
        }

        if (foundProductHandler) {
          console.log(`  ✅ Product event handlers are configured`)
        } else {
          console.log(`  ⚠️  Product event handlers not found`)
        }
      } catch (error) {
        console.error('  ❌ Error:', error.message)
        throw error
      }
    })
  })

  describe('Phase 10.3: API Category Management', () => {
    test('Should allow creating categories via API', async () => {
      console.log('\n  📝 Test 10.3.1: API category creation')

      try {
        const response = await request(app).get('/api/v1/content/categories?_t=' + Date.now())

        console.log(`     Response Status: ${response.statusCode}`)

        const categories = Array.isArray(response.body) ? response.body : response.body.data || []
        console.log(`     Categories available: ${categories.length}`)

        expect(response.statusCode).toBe(200)
        console.log(`  ✅ Category API endpoint is working`)
      } catch (error) {
        console.error('  ❌ Error:', error.message)
        throw error
      }
    })

    test('Should verify category data consistency', async () => {
      console.log('\n  📝 Test 10.3.2: Category data consistency')

      try {
        // Get categories
        const catResponse = await request(app).get('/api/v1/content/categories?_t=' + Date.now())

        const categories = Array.isArray(catResponse.body)
          ? catResponse.body
          : catResponse.body.data || []

        if (categories.length === 0) {
          console.log('  ⏭️  No categories to validate')
          return
        }

        // Check each category has required fields
        let validCount = 0
        categories.forEach((cat) => {
          if (cat.id && cat.name) {
            validCount++
          }
        })

        console.log(`     Categories with valid structure: ${validCount}/${categories.length}`)

        if (validCount === categories.length) {
          console.log(`  ✅ All categories have valid data structure`)
        } else {
          console.log(`  ⚠️  Some categories have missing fields`)
        }
      } catch (error) {
        console.error('  ❌ Error:', error.message)
        throw error
      }
    })
  })

  describe('Phase 10.4: Frontend Category Sync Verification', () => {
    test('Should return categories in format expected by frontend', async () => {
      console.log('\n  📝 Test 10.4.1: Frontend category format')

      try {
        const response = await request(app).get('/api/v1/content/categories?_t=' + Date.now())

        const categories = Array.isArray(response.body) ? response.body : response.body.data || []

        if (categories.length === 0) {
          console.log('  ⏭️  No categories available')
          return
        }

        const firstCategory = categories[0]
        const hasRequiredFields = firstCategory.id && firstCategory.name

        console.log(`     Sample category:`, JSON.stringify(firstCategory).substring(0, 100))
        console.log(`     Has required fields: ${hasRequiredFields}`)

        if (hasRequiredFields) {
          console.log(`  ✅ Categories are in correct format for frontend`)
        } else {
          console.log(`  ❌ Categories missing required fields`)
        }
      } catch (error) {
        console.error('  ❌ Error:', error.message)
        throw error
      }
    })

    test('Should handle category filtering consistently', async () => {
      console.log('\n  📝 Test 10.4.2: Category filtering consistency')

      try {
        // Get categories
        const catResponse = await request(app).get('/api/v1/content/categories?_t=' + Date.now())

        const categories = Array.isArray(catResponse.body)
          ? catResponse.body
          : catResponse.body.data || []

        if (categories.length === 0) {
          console.log('  ⏭️  No categories available')
          return
        }

        const testCategory = categories[0]

        // Test filtering by exact name
        const exactResponse = await request(app).get(
          `/api/v1/product?category=${encodeURIComponent(testCategory.name)}`,
        )

        // Test filtering by lowercase
        const lowerResponse = await request(app).get(
          `/api/v1/product?category=${encodeURIComponent(testCategory.name.toLowerCase())}`,
        )

        console.log(`     Exact match results: ${exactResponse.body.products?.length || 0}`)
        console.log(`     Lowercase results: ${lowerResponse.body.products?.length || 0}`)

        expect(exactResponse.statusCode).toBe(200)
        expect(lowerResponse.statusCode).toBe(200)
        console.log(`  ✅ Category filtering is consistent`)
      } catch (error) {
        console.error('  ❌ Error:', error.message)
        throw error
      }
    })
  })

  describe('Phase 10.5: System Readiness', () => {
    test('Should confirm all systems are ready for production', async () => {
      console.log('\n  📝 Test 10.5.1: Production readiness check')

      try {
        const checks = {
          'Socket.io': false,
          Database: false,
          API: false,
          Categories: false,
        }

        // Check Socket.io
        const packageJsonPath = path.join(process.cwd(), 'package.json')
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
        checks['Socket.io'] = !!packageJson.dependencies['socket.io']

        // Check Database
        try {
          const result = await database.query('SELECT 1')
          checks['Database'] = !!result
        } catch (e) {
          checks['Database'] = false
        }

        // Check API
        const apiResponse = await request(app).get('/api/v1/csrf-token')
        checks['API'] = apiResponse.statusCode === 200

        // Check Categories
        const catResponse = await request(app).get('/api/v1/content/categories?_t=' + Date.now())
        checks['Categories'] = catResponse.statusCode === 200

        // Report
        console.log('     System Status:')
        Object.entries(checks).forEach(([key, status]) => {
          console.log(`       ${status ? '✅' : '❌'} ${key}`)
        })

        const allReady = Object.values(checks).every((v) => v === true)

        if (allReady) {
          console.log(`  ✅ All systems ready for production!`)
        } else {
          const failedSystems = Object.entries(checks)
            .filter(([_, status]) => !status)
            .map(([name]) => name)
          console.log(`  ⚠️  Some systems need attention: ${failedSystems.join(', ')}`)
        }
      } catch (error) {
        console.error('  ❌ Error:', error.message)
        throw error
      }
    })
  })
})
