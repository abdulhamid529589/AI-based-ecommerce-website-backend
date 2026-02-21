/**
 * Cart Routes
 * Handles all cart-related endpoints
 */

import express from 'express'
import { isAuthenticated } from '../middlewares/authMiddleware.js'
import {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
} from '../controllers/cartController.js'

const router = express.Router()

/**
 * Protected Routes (Authentication Required)
 */

// Get user's cart
router.get('/api/v1/customer/cart', isAuthenticated, getCart)

// Add item to cart
router.post('/api/v1/customer/cart', isAuthenticated, addToCart)

// Update cart item quantity
router.put('/api/v1/customer/cart/:item_id', isAuthenticated, updateCartItem)

// Remove item from cart
router.delete('/api/v1/customer/cart/:item_id', isAuthenticated, removeFromCart)

// Clear entire cart
router.delete('/api/v1/customer/cart', isAuthenticated, clearCart)

export default router
