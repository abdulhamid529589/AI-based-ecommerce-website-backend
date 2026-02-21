/**
 * Wishlist Routes
 * Handles all wishlist-related endpoints
 */

import express from 'express'
import { isAuthenticated } from '../middlewares/authMiddleware.js'
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  getWishlistCount,
} from '../controllers/wishlistController.js'

const router = express.Router()

/**
 * Protected Routes (Authentication Required)
 */

// Get user's wishlist
router.get('/api/v1/customer/wishlist', isAuthenticated, getWishlist)

// Add product to wishlist
router.post('/api/v1/customer/wishlist', isAuthenticated, addToWishlist)

// Remove product from wishlist
router.delete('/api/v1/customer/wishlist/:product_id', isAuthenticated, removeFromWishlist)

// Get wishlist count
router.get('/api/v1/customer/wishlist/count', isAuthenticated, getWishlistCount)

export default router
