import express from 'express'
import { isAuthenticated, authorizedRoles } from '../middlewares/authMiddleware.js'

const router = express.Router()

/**
 * Lightweight monitoring stubs so dashboard/storefront clients do not 404.
 * Real metrics can replace these later without changing client paths.
 */
router.get('/metrics', isAuthenticated, authorizedRoles('Admin'), (req, res) => {
  res.status(200).json({
    success: true,
    apiResponseTime: 0,
    serverUptime: process.uptime(),
    databaseQueryTime: 0,
    cacheHitRate: 0,
    errorRate: 0,
    requestsPerSecond: 0,
    activeConnections: 0,
    cpuUsage: 0,
    memoryUsage: process.memoryUsage().heapUsed,
    diskUsage: 0,
    stub: true,
  })
})

router.post('/metrics', isAuthenticated, (req, res) => {
  res.status(202).json({ success: true, accepted: true })
})

router.post('/issues', isAuthenticated, (req, res) => {
  res.status(202).json({ success: true, accepted: true })
})

export default router
