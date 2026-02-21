import express from 'express'
import {
  aiSearch,
  getSearchSuggestions,
  getPersonalizedRecommendations,
  getTrendingProducts,
} from '../controllers/searchController.js'

const router = express.Router()

/**
 * POST /api/v1/search
 * Advanced AI search with filtering, suggestions, and recommendations
 * Body: { query, category?, filters?, limit?, page? }
 */
router.post('/', aiSearch)

/**
 * GET /api/v1/search/suggestions
 * Get search suggestions (text, categories, trending)
 * Query: { query }
 */
router.get('/suggestions', getSearchSuggestions)

/**
 * POST /api/v1/search/recommendations
 * Get personalized product recommendations
 * Body: { userId?, context?, limit? }
 */
router.post('/recommendations', getPersonalizedRecommendations)

/**
 * GET /api/v1/search/trending
 * Get trending products by timeframe
 * Query: { limit?, timeframe? }
 */
router.get('/trending', getTrendingProducts)

export default router
