import express from 'express'
import {
  getAllUsers,
  deleteUser,
  dashboardStats,
  updateUser,
  getRevenueAnalytics,
  getCategorySalesAnalytics,
  getCustomerOrders,
  getDashboardActivityFeed,
} from '../controllers/adminController.js'
import {
  createProduct,
  fetchAllProducts,
  updateProduct,
  deleteProduct,
  fetchSingleProduct,
  bulkImportProducts,
} from '../controllers/productController.js'
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
  getHeroSettings,
  updateHeroSettings,
  getFeaturedSettings,
  updateFeaturedSettings,
  getHomeSections,
  updateHomeSections,
  getCategories,
  updateCategories,
  getMenus,
  updateMenus,
  getThemeCustomization,
  updateThemeCustomization,
  getShipping,
  updateShipping,
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

// Settings - Hero Slides Settings
router.get('/settings/hero-settings', isAuthenticated, authorizedRoles('Admin'), getHeroSettings)
router.post(
  '/settings/hero-settings',
  isAuthenticated,
  authorizedRoles('Admin'),
  updateHeroSettings,
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

// Settings - Featured Products Settings
router.get(
  '/settings/featured-settings',
  isAuthenticated,
  authorizedRoles('Admin'),
  getFeaturedSettings,
)
router.post(
  '/settings/featured-settings',
  isAuthenticated,
  authorizedRoles('Admin'),
  updateFeaturedSettings,
)

// Settings - Homepage Sections
router.get('/settings/home-sections', isAuthenticated, authorizedRoles('Admin'), getHomeSections)
router.post(
  '/settings/home-sections',
  isAuthenticated,
  authorizedRoles('Admin'),
  updateHomeSections,
)

// Settings - Navigation Menus
router.get('/settings/menus', isAuthenticated, authorizedRoles('Admin'), getMenus)
router.post('/settings/menus', isAuthenticated, authorizedRoles('Admin'), updateMenus)

// Categories management (admin)
router.get('/settings/categories', isAuthenticated, authorizedRoles('Admin'), getCategories)
router.post('/settings/categories', isAuthenticated, authorizedRoles('Admin'), updateCategories)

// Settings - Theme Customization
router.get('/settings/theme', isAuthenticated, authorizedRoles('Admin'), getThemeCustomization)
router.post('/settings/theme', isAuthenticated, authorizedRoles('Admin'), updateThemeCustomization)

// Settings - Shipping & Delivery
router.get('/settings/shipping', isAuthenticated, authorizedRoles('Admin'), getShipping)
router.post('/settings/shipping', isAuthenticated, authorizedRoles('Admin'), updateShipping)

// Route aliases for dashboard compatibility
router.get('/dashboard', isAuthenticated, authorizedRoles('Admin'), dashboardStats)
router.get('/customers', isAuthenticated, authorizedRoles('Admin'), getAllUsers)
router.get(
  '/customers/:customerId/orders',
  isAuthenticated,
  authorizedRoles('Admin'),
  getCustomerOrders,
)

// Analytics endpoints
router.get('/analytics/revenue', isAuthenticated, authorizedRoles('Admin'), getRevenueAnalytics)
router.get(
  '/analytics/category-sales',
  isAuthenticated,
  authorizedRoles('Admin'),
  getCategorySalesAnalytics,
)

// Activity feed endpoint
router.get(
  '/dashboard/activity',
  isAuthenticated,
  authorizedRoles('Admin'),
  getDashboardActivityFeed,
)

export default router
