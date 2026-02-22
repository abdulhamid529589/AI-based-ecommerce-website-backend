import express from 'express'
import {
  createProduct,
  fetchAllProducts,
  updateProduct,
  deleteProduct,
  fetchSingleProduct,
  postProductReview,
  deleteReview,
  fetchAIFilteredProducts,
  bulkImportProducts,
  duplicateProduct,
  getProductReviews,
  updateReviewStatus,
  adminDeleteReview,
  getProductAnalytics,
  searchSuggestions,
  trendingProducts,
  markReviewHelpful,
} from '../controllers/productController.js'
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  getWishlistCount,
} from '../controllers/wishlistController.js'
import { getShopInfo, getHeroSlides } from '../controllers/settingsController.js'
import { authorizedRoles, isAuthenticated } from '../middlewares/authMiddleware.js'
import { validateRequest } from '../middlewares/validationMiddleware.js'

const router = express.Router()

// Public settings endpoints
router.get('/settings/shop-info', getShopInfo)
router.get('/settings/hero-slides', getHeroSlides)

router.post(
  '/admin/create',
  isAuthenticated,
  authorizedRoles('Admin'),
  validateRequest('createProduct'),
  createProduct,
)
router.get('/', fetchAllProducts)
router.get('/singleProduct/:productId', fetchSingleProduct)
router.put(
  '/post-new/review/:productId',
  isAuthenticated,
  validateRequest('postReview'),
  postProductReview,
)
router.delete('/delete/review/:productId', isAuthenticated, deleteReview)
router.put('/admin/update/:productId', isAuthenticated, authorizedRoles('Admin'), updateProduct)
router.delete('/admin/delete/:productId', isAuthenticated, authorizedRoles('Admin'), deleteProduct)
router.post('/ai-search', isAuthenticated, fetchAIFilteredProducts)

// Enhanced product management endpoints
router.post('/import', isAuthenticated, authorizedRoles('Admin'), bulkImportProducts)
router.post('/:productId/duplicate', isAuthenticated, authorizedRoles('Admin'), duplicateProduct)
router.get(
  '/:productId/admin/reviews',
  isAuthenticated,
  authorizedRoles('Admin'),
  getProductReviews,
)
router.patch(
  '/review/:reviewId/status',
  isAuthenticated,
  authorizedRoles('Admin'),
  updateReviewStatus,
)
router.delete('/review/:reviewId', isAuthenticated, authorizedRoles('Admin'), adminDeleteReview)
router.get('/:productId/analytics', isAuthenticated, authorizedRoles('Admin'), getProductAnalytics)

// Search endpoints
router.get('/search/suggestions', searchSuggestions)
router.get('/search/trending', trendingProducts)

// Review helpful endpoint
router.post('/review/helpful/:reviewId', markReviewHelpful)

// Wishlist endpoints
router.get('/wishlist', isAuthenticated, getWishlist)
router.post('/wishlist/:productId', isAuthenticated, addToWishlist)
router.delete('/wishlist/:productId', isAuthenticated, removeFromWishlist)
router.get('/wishlist/count', isAuthenticated, getWishlistCount)

export default router
