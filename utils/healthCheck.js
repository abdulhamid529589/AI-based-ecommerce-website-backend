/**
 * Health Check Endpoint
 * Add this to your express app for deployment monitoring
 *
 * Usage in app.js:
 * import { setupHealthCheck } from './utils/healthCheck.js'
 * setupHealthCheck(app)
 */

import database from '../database/db.js'

export function setupHealthCheck(app) {
  /**
   * Basic health check - Used by Render's health monitoring
   */
  app.get('/api/v1/health', async (req, res) => {
    try {
      const dbCheck = await database.query('SELECT NOW()')

      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        database: {
          connected: !!dbCheck.rows[0],
          timestamp: dbCheck.rows[0]?.now,
        },
        environment: process.env.NODE_ENV || 'development',
      })
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
      })
    }
  })

  /**
   * Detailed status check - Full deployment information
   */
  app.get('/api/v1/status', async (req, res) => {
    try {
      // Database info
      let productCount = 0
      let columnCount = 0

      try {
        const productsResult = await database.query('SELECT COUNT(*) FROM products')
        productCount = parseInt(productsResult.rows[0].count)

        const columnsResult = await database.query(`
          SELECT COUNT(*) FROM information_schema.columns
          WHERE table_name = 'products' AND table_schema = 'public'
        `)
        columnCount = parseInt(columnsResult.rows[0].count)
      } catch (dbError) {
        // Database might not be ready yet
      }

      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        server: {
          uptime: Math.floor(process.uptime()),
          environment: process.env.NODE_ENV || 'development',
          version: process.env.npm_package_version || 'unknown',
          platform: process.platform,
          nodeVersion: process.version,
        },
        database: {
          connected: productCount >= 0,
          products: productCount,
          productColumns: columnCount,
          expectedColumns: 46,
          migrationStatus: columnCount >= 10 ? 'complete' : 'in-progress',
        },
        memory: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          external: Math.round(process.memoryUsage().external / 1024 / 1024),
        },
        deployment: {
          onRender: !!process.env.RENDER,
          port: process.env.PORT || 5000,
        },
      })
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message,
      })
    }
  })

  /**
   * Readiness check - For Kubernetes-style deployments
   */
  app.get('/api/v1/ready', async (req, res) => {
    try {
      // Check database is connected
      await database.query('SELECT 1')

      // Check products table exists
      const result = await database.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_name = 'products' AND table_schema = 'public'
      `)

      if (result.rows.length === 0) {
        return res.status(503).json({
          ready: false,
          reason: 'products table not found',
        })
      }

      res.json({
        ready: true,
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      res.status(503).json({
        ready: false,
        reason: error.message,
      })
    }
  })

  /**
   * Liveness check - For Kubernetes-style deployments
   */
  app.get('/api/v1/alive', (req, res) => {
    res.json({
      alive: true,
      timestamp: new Date().toISOString(),
    })
  })

  console.log('✅ Health check endpoints registered:')
  console.log('   • GET /api/v1/health      - Basic health check')
  console.log('   • GET /api/v1/status      - Detailed status')
  console.log('   • GET /api/v1/ready       - Readiness probe')
  console.log('   • GET /api/v1/alive       - Liveness probe')
}
