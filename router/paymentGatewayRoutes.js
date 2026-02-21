import express from 'express'
import { isAuthenticated, authorizedRoles } from '../middlewares/authMiddleware.js' // ✅ Add auth import
import { idempotencyKeyMiddleware } from '../middlewares/idempotencyKeyMiddleware.js'
import {
  initiateBkashPayment,
  bkashPaymentCallback,
  initiateNagadPayment,
  nagadPaymentCallback,
  initiateRocketPayment,
  rocketPaymentCallback,
  initiateCODPayment,
  getPaymentStatus,
} from '../controllers/paymentGatewayController.js'

const router = express.Router()

// 🔑 IDEMPOTENCY KEY MIDDLEWARE - Prevents duplicate charges
// Applied to all payment initiation routes

// bKash routes - ✅ Add auth + idempotency key
router.post('/bkash/initiate', isAuthenticated, idempotencyKeyMiddleware, initiateBkashPayment)
router.get('/bkash/callback', bkashPaymentCallback)

// Nagad routes - ✅ Add auth + idempotency key
router.post('/nagad/initiate', isAuthenticated, idempotencyKeyMiddleware, initiateNagadPayment)
router.post('/nagad/callback', nagadPaymentCallback)

// Rocket routes - ✅ Add auth + idempotency key
router.post('/rocket/initiate', isAuthenticated, idempotencyKeyMiddleware, initiateRocketPayment)
router.post('/rocket/callback', rocketPaymentCallback)

// Cash on Delivery - ✅ Add auth + idempotency key
router.post('/cod/initiate', isAuthenticated, idempotencyKeyMiddleware, initiateCODPayment)

// Get payment status - ✅ Add auth
router.get('/status/:orderId', isAuthenticated, getPaymentStatus)

export default router
