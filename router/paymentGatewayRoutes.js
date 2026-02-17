import express from 'express'
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

// bKash routes
router.post('/bkash/initiate', initiateBkashPayment)
router.get('/bkash/callback', bkashPaymentCallback)

// Nagad routes
router.post('/nagad/initiate', initiateNagadPayment)
router.post('/nagad/callback', nagadPaymentCallback)

// Rocket routes
router.post('/rocket/initiate', initiateRocketPayment)
router.post('/rocket/callback', rocketPaymentCallback)

// Cash on Delivery
router.post('/cod/initiate', initiateCODPayment)

// Get payment status
router.get('/status/:orderId', getPaymentStatus)

export default router
