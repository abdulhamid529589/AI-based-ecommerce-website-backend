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
  updateCartItem,
  removeFromCart,
  clearCart,
} from '../controllers/cartController.js'
import { isAuthenticated, authorizedRoles } from '../middlewares/authMiddleware.js'
import { validateRequest } from '../middlewares/validationMiddleware.js'
import { strictLimiter } from '../middlewares/securityMiddleware.js'
import {
  openDispute,
  listMyDisputes,
  resolveDispute,
  listAdminDisputes,
} from '../controllers/disputeController.js'

const router = express.Router()

// Order management endpoints — strictLimiter must run BEFORE the handler (not after mount)
router.post('/new', isAuthenticated, strictLimiter, placeNewOrder)
router.get('/orders/me', isAuthenticated, fetchMyOrders)
router.get('/admin/getall', isAuthenticated, authorizedRoles('Admin'), fetchAllOrders)
router.put(
  '/admin/update/:orderId',
  isAuthenticated,
  authorizedRoles('Admin'),
  validateRequest('updateOrderStatus'),
  updateOrderStatus,
)
router.put(
  '/admin/payment/:orderId',
  isAuthenticated,
  authorizedRoles('Admin'),
  updatePaymentStatus,
)
router.delete('/admin/delete/:orderId', isAuthenticated, authorizedRoles('Admin'), deleteOrder)

// Disputes (buyer + admin)
router.post('/disputes', isAuthenticated, strictLimiter, openDispute)
router.get('/disputes/me', isAuthenticated, listMyDisputes)
router.get('/disputes/admin', isAuthenticated, authorizedRoles('Admin'), listAdminDisputes)
router.put(
  '/disputes/:disputeId/resolve',
  isAuthenticated,
  authorizedRoles('Admin'),
  resolveDispute,
)

router.get('/:orderId', isAuthenticated, fetchSingleOrder)

// Cart management endpoints
router.get('/cart', isAuthenticated, getCart)
router.post('/cart/:productId', isAuthenticated, addToCart)
router.put('/cart/:productId', isAuthenticated, updateCartItem)
router.delete('/cart/:productId', isAuthenticated, removeFromCart)
router.delete('/cart', isAuthenticated, clearCart)

export default router
