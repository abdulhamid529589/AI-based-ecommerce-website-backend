import express from 'express'
import {
  createOrderFromCheckout,
  processPayment,
  validatePromoCode,
  getOrderDetails,
  getUserOrders,
  trackOrder,
  cancelOrder,
} from '../controllers/checkoutController.js'
import { isAuthenticated } from '../middlewares/authMiddleware.js'
import { idempotencyKeyMiddleware } from '../middlewares/idempotencyKeyMiddleware.js'

const checkoutRouter = express.Router()

// ✅ PUBLIC ROUTES (No auth required)
// Validate promo code before checkout
checkoutRouter.get('/validate-promo/:code/:subtotal', validatePromoCode)

// ✅ AUTHENTICATED ROUTES (Auth required)
// Create order from SmartCheckout form
checkoutRouter.post(
  '/create-order',
  isAuthenticated,
  idempotencyKeyMiddleware,
  createOrderFromCheckout,
)

// Process payment for order
checkoutRouter.post('/process-payment', isAuthenticated, idempotencyKeyMiddleware, processPayment)

// Get order details
checkoutRouter.get('/order/:orderId', isAuthenticated, getOrderDetails)

// Get all orders for authenticated user
checkoutRouter.get('/orders', isAuthenticated, getUserOrders)

// Track specific order
checkoutRouter.get('/track/:orderId', isAuthenticated, trackOrder)

// Cancel order
checkoutRouter.delete('/cancel/:orderId', isAuthenticated, cancelOrder)

export default checkoutRouter
