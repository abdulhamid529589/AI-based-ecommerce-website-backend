import express from 'express'
import {
  fetchSingleOrder,
  placeNewOrder,
  fetchMyOrders,
  fetchAllOrders,
  updateOrderStatus,
  updatePaymentStatus,
  deleteOrder,
} from '../controllers/orderController.js'
import {
  getCart,
  addToCart,
  updateCartItemQuantity,
  removeFromCart,
  clearCart,
} from '../controllers/cartController.js'
import { isAuthenticated, authorizedRoles } from '../middlewares/authMiddleware.js'

const router = express.Router()

// Order management endpoints
router.post('/new', isAuthenticated, placeNewOrder)
router.get('/orders/me', isAuthenticated, fetchMyOrders)
router.get('/admin/getall', isAuthenticated, authorizedRoles('Admin'), fetchAllOrders)
router.put('/admin/update/:orderId', isAuthenticated, authorizedRoles('Admin'), updateOrderStatus)
router.put(
  '/admin/payment/:orderId',
  isAuthenticated,
  authorizedRoles('Admin'),
  updatePaymentStatus,
)
router.delete('/admin/delete/:orderId', isAuthenticated, authorizedRoles('Admin'), deleteOrder)
router.get('/:orderId', isAuthenticated, fetchSingleOrder)

// Cart management endpoints
router.get('/cart', isAuthenticated, getCart)
router.post('/cart/:productId', isAuthenticated, addToCart)
router.put('/cart/:productId', isAuthenticated, updateCartItemQuantity)
router.delete('/cart/:productId', isAuthenticated, removeFromCart)
router.delete('/cart', isAuthenticated, clearCart)

export default router
