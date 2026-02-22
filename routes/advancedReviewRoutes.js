/**
 * Advanced Review Routes
 * Insane-level endpoints for reviews system
 */

import express from 'express'
import { isAuthenticated } from '../middlewares/authMiddleware.js'
import {
  getAdvancedProductReviews,
  createAdvancedReview,
  voteOnReview,
  flagReview,
  replyToReview,
  getReviewStatistics,
} from '../controllers/advancedReviewController.js'

const router = express.Router()

/**
 * Public Routes (No Authentication Required)
 */

// Get reviews for a product with advanced filtering
router.get('/api/v1/product/:product_id/reviews', getAdvancedProductReviews)

// Get review statistics
router.get('/api/v1/product/:product_id/review-stats', getReviewStatistics)

/**
 * Protected Routes (Authentication Required)
 */

// Create a review
router.post('/api/v1/product/:product_id/reviews', isAuthenticated, createAdvancedReview)

// Vote on review (helpful/unhelpful)
router.post('/api/v1/reviews/:review_id/vote', isAuthenticated, voteOnReview)

// Flag review as inappropriate
router.post('/api/v1/reviews/:review_id/flag', isAuthenticated, flagReview)

// Reply to review
router.post('/api/v1/reviews/:review_id/replies', isAuthenticated, replyToReview)

export default router
