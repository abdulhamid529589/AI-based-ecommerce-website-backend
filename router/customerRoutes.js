/**
 * Customer Routes
 * Handles all customer-related operations
 */

import express from 'express'
import {
  getCustomerOrders,
  getCustomerDashboard,
  getOrderDetails,
  getCustomerProfile,
  updateCustomerProfile,
  getCustomerAddresses,
} from '../controllers/customerController.js'
import {
  getMyLoyalty,
  quoteLoyaltyRedeem,
  previewPromo,
} from '../controllers/loyaltyController.js'
import { isAuthenticated } from '../middlewares/authMiddleware.js'
import { validateRequest } from '../middlewares/validationMiddleware.js'

const router = express.Router()

// All customer routes require authentication
router.use(isAuthenticated)

// Dashboard and profile routes
router.get('/dashboard', getCustomerDashboard)
router.get('/profile', getCustomerProfile)
router.put('/profile', validateRequest('customerProfile'), updateCustomerProfile)

// Orders routes
router.get('/orders', getCustomerOrders)
router.get('/orders/:orderId', getOrderDetails)

// Addresses route
router.get('/addresses', getCustomerAddresses)

// Loyalty + promo preview
router.get('/loyalty', getMyLoyalty)
router.post('/loyalty/quote', quoteLoyaltyRedeem)
router.post('/promo/preview', previewPromo)

export default router
