/**
 * Review Routes
 * Handles all review-related endpoints
 */

import express from 'express'
import { isAuthenticated } from '../middlewares/authMiddleware.js'
import {
  getProductReviews,
  getAllReviewsAdmin,
  createReview,
  updateReview,
  deleteReview,
} from '../controllers/reviewController.js'
import { authorizedRoles } from '../middlewares/authMiddleware.js'

const router = express.Router()

/**
 * Public Routes (No Authentication Required)
 */

// Get reviews for a product
router.get('/api/v1/product/:product_id/reviews', getProductReviews)

// Admin: list reviews across all products
router.get('/api/v1/admin/reviews', isAuthenticated, authorizedRoles('Admin'), getAllReviewsAdmin)

/**
 * Protected Routes (Authentication Required)
 */

// Create a review
router.post('/api/v1/product/:product_id/reviews', isAuthenticated, createReview)

// Update a review
router.put('/api/v1/reviews/:review_id', isAuthenticated, updateReview)

// Delete a review
router.delete('/api/v1/reviews/:review_id', isAuthenticated, deleteReview)

export default router
