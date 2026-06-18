import express from 'express'
import {
  validatePromoCode,
  getOrderDetails,
  getUserOrders,
  trackOrder,
  cancelOrder,
} from '../controllers/checkoutController.js'
import { isAuthenticated } from '../middlewares/authMiddleware.js'

const checkoutRouter = express.Router()

const deprecatedCheckoutHandler = (req, res) => {
  res.status(410).json({
    success: false,
    message:
      'This checkout endpoint is deprecated. Use POST /api/v1/order/new for order placement.',
    useInstead: '/api/v1/order/new',
  })
}

// Public promo validation (legacy — prefer admin promotions API)
checkoutRouter.get('/validate-promo/:code/:subtotal', validatePromoCode)

// Deprecated: broken schema — use orderController instead
checkoutRouter.post('/create-order', deprecatedCheckoutHandler)
checkoutRouter.post('/process-payment', deprecatedCheckoutHandler)

// Legacy read endpoints (may not match current orders schema)
checkoutRouter.get('/order/:orderId', isAuthenticated, getOrderDetails)
checkoutRouter.get('/orders', isAuthenticated, getUserOrders)
checkoutRouter.get('/track/:orderId', isAuthenticated, trackOrder)
checkoutRouter.delete('/cancel/:orderId', isAuthenticated, cancelOrder)

export default checkoutRouter
