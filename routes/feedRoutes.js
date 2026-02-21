import express from 'express'
import { isAuthenticated } from '../middlewares/authMiddleware.js'
import {
  getPersonalizedFeed,
  getProductRecommendations,
  getUserInsights,
  getWishlistInsights,
} from '../controllers/premiumFeaturesController.js'

const router = express.Router()

/**
 * GET /api/v1/feed
 * Get personalized feed for user
 */
router.get('/feed', getPersonalizedFeed)

/**
 * GET /api/v1/feed/recommendations/:productId
 * Get smart recommendations for a specific product
 */
router.get('/recommendations/:productId', getProductRecommendations)

/**
 * GET /api/v1/feed/insights
 * Get user purchase insights and analytics (Protected)
 */
router.get('/insights', isAuthenticated, getUserInsights)

/**
 * GET /api/v1/feed/wishlist-insights
 * Get wishlist insights with discount recommendations (Protected)
 */
router.get('/wishlist-insights', isAuthenticated, getWishlistInsights)

export default router
