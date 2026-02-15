import express from 'express'
import {
  getAllUsers,
  deleteUser,
  dashboardStats,
  updateUser,
} from '../controllers/adminController.js'
import {
  getShopInfo,
  updateShopInfo,
  getHeroSlides,
  createHeroSlide,
  updateHeroSlide,
  deleteHeroSlide,
  getFeaturedProducts,
  addFeaturedProduct,
  removeFeaturedProduct,
  updateFeaturedOrder,
} from '../controllers/settingsController.js'
import { authorizedRoles, isAuthenticated } from '../middlewares/authMiddleware.js'

const router = express.Router()

router.get('/getallusers', isAuthenticated, authorizedRoles('Admin'), getAllUsers) // DASHBOARD
router.put('/update/:id', isAuthenticated, authorizedRoles('Admin'), updateUser)
router.delete('/delete/:id', isAuthenticated, authorizedRoles('Admin'), deleteUser)
router.get('/fetch/dashboard-stats', isAuthenticated, authorizedRoles('Admin'), dashboardStats)

// Settings - Shop Info
router.get('/settings/shop', isAuthenticated, authorizedRoles('Admin'), getShopInfo)
router.post('/settings/shop', isAuthenticated, authorizedRoles('Admin'), updateShopInfo)

// Settings - Hero Slides
router.get('/settings/hero-slides', isAuthenticated, authorizedRoles('Admin'), getHeroSlides)
router.post('/settings/hero-slides', isAuthenticated, authorizedRoles('Admin'), createHeroSlide)
router.put('/settings/hero-slides/:id', isAuthenticated, authorizedRoles('Admin'), updateHeroSlide)
router.delete(
  '/settings/hero-slides/:id',
  isAuthenticated,
  authorizedRoles('Admin'),
  deleteHeroSlide,
)

// Settings - Featured Products
router.get(
  '/settings/featured-products',
  isAuthenticated,
  authorizedRoles('Admin'),
  getFeaturedProducts,
)
router.post(
  '/settings/featured-products',
  isAuthenticated,
  authorizedRoles('Admin'),
  addFeaturedProduct,
)
router.delete(
  '/settings/featured-products/:productId',
  isAuthenticated,
  authorizedRoles('Admin'),
  removeFeaturedProduct,
)

// Update featured products order
router.put(
  '/settings/featured-products/order',
  isAuthenticated,
  authorizedRoles('Admin'),
  updateFeaturedOrder,
)

export default router
