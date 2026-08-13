import express from 'express'
import {
  getShippingQuote,
  listZones,
  createZone,
  updateZone,
  createRate,
  updateRate,
  deleteRate,
} from '../controllers/shippingController.js'
import { isAuthenticated, authorizedRoles } from '../middlewares/authMiddleware.js'

const router = express.Router()

// Public / buyer quote
router.get('/quote', getShippingQuote)
router.post('/quote', getShippingQuote)

// Admin zone management
router.get('/zones', isAuthenticated, authorizedRoles('Admin'), listZones)
router.post('/zones', isAuthenticated, authorizedRoles('Admin'), createZone)
router.put('/zones/:zoneId', isAuthenticated, authorizedRoles('Admin'), updateZone)
router.post('/rates', isAuthenticated, authorizedRoles('Admin'), createRate)
router.put('/rates/:rateId', isAuthenticated, authorizedRoles('Admin'), updateRate)
router.delete('/rates/:rateId', isAuthenticated, authorizedRoles('Admin'), deleteRate)

export default router
