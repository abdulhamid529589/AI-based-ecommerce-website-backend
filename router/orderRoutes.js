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
import { isAuthenticated, authorizedRoles } from '../middlewares/authMiddleware.js'

const router = express.Router()
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

export default router
