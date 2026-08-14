import express from 'express'
import {
  // Pages
  getPages,
  createPage,
  updatePage,
  deletePage,
  // Sections
  getSections,
  createSection,
  updateSection,
  deleteSection,
  reorderSections,
  // Menu Items
  getMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  // Email Templates
  getEmailTemplates,
  getEmailTemplate,
  updateEmailTemplate,
  // Notifications
  getNotificationSettings,
  updateNotificationSettings,
  // SEO
  getSeoSettings,
  updateSeoSettings,
  // Components
  getComponentSettings,
  updateComponentSetting,
  // Footer
  getFooterContent,
  updateFooterContent,
  // Banners
  getBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  // Global
  getGlobalSettings,
  updateGlobalSettings,
  // Categories
  getCategories,
  getStorefrontConfig,
  getPublicPage,
  submitContactInquiry,
  subscribeNewsletter,
} from '../controllers/contentController.js'
import { uploadImage } from '../controllers/settingsController.js'
import { getCategoriesWithSubcategories_Controller } from '../controllers/subcategoryController.js'
import { isAuthenticated, authorizedRoles } from '../middlewares/authMiddleware.js'

const router = express.Router()

// ============================================
// PUBLIC STOREFRONT BOOTSTRAP
// ============================================
router.get('/storefront', getStorefrontConfig)
router.get('/pages/:slug', getPublicPage)
router.post('/contact', submitContactInquiry)
router.post('/newsletter', subscribeNewsletter)

// ============================================
// PAGE MANAGEMENT (Admin Only)
// ============================================
router.get('/pages', isAuthenticated, authorizedRoles('Admin'), getPages)
router.post('/pages', isAuthenticated, authorizedRoles('Admin'), createPage)
router.put('/pages/:pageId', isAuthenticated, authorizedRoles('Admin'), updatePage)
router.delete('/pages/:pageId', isAuthenticated, authorizedRoles('Admin'), deletePage)

// ============================================
// SECTION MANAGEMENT (Admin Only)
// ============================================
router.get('/sections', isAuthenticated, authorizedRoles('Admin'), getSections)
router.post('/sections', isAuthenticated, authorizedRoles('Admin'), createSection)
router.put('/sections/:sectionId', isAuthenticated, authorizedRoles('Admin'), updateSection)
router.delete('/sections/:sectionId', isAuthenticated, authorizedRoles('Admin'), deleteSection)
router.post('/sections/reorder', isAuthenticated, authorizedRoles('Admin'), reorderSections)

// ============================================
// NAVIGATION MENU (Admin Only)
// ============================================
router.get('/menus', isAuthenticated, authorizedRoles('Admin'), getMenuItems)
router.post('/menus', isAuthenticated, authorizedRoles('Admin'), createMenuItem)
router.put('/menus/:menuItemId', isAuthenticated, authorizedRoles('Admin'), updateMenuItem)
router.delete('/menus/:menuItemId', isAuthenticated, authorizedRoles('Admin'), deleteMenuItem)

// ============================================
// EMAIL TEMPLATES (Admin Only)
// ============================================
router.get('/email-templates', isAuthenticated, authorizedRoles('Admin'), getEmailTemplates)
router.get(
  '/email-templates/:templateId',
  isAuthenticated,
  authorizedRoles('Admin'),
  getEmailTemplate,
)
router.put(
  '/email-templates/:templateId',
  isAuthenticated,
  authorizedRoles('Admin'),
  updateEmailTemplate,
)

// ============================================
// NOTIFICATION SETTINGS (Admin Only)
// ============================================
router.get('/notifications', isAuthenticated, authorizedRoles('Admin'), getNotificationSettings)
router.post('/notifications', isAuthenticated, authorizedRoles('Admin'), updateNotificationSettings)

// ============================================
// SEO SETTINGS (Admin Only)
// ============================================
router.get('/seo', isAuthenticated, authorizedRoles('Admin'), getSeoSettings)
router.post('/seo', isAuthenticated, authorizedRoles('Admin'), updateSeoSettings)

// ============================================
// COMPONENT SETTINGS (Admin Only)
// ============================================
router.get('/components', isAuthenticated, authorizedRoles('Admin'), getComponentSettings)
router.put(
  '/components/:componentId',
  isAuthenticated,
  authorizedRoles('Admin'),
  updateComponentSetting,
)

// ============================================
// FOOTER CONTENT
// ============================================
router.get('/footer', getFooterContent)
router.post('/footer', isAuthenticated, authorizedRoles('Admin'), updateFooterContent)

// ============================================
// PROMOTIONAL BANNERS
// ============================================
// GET banners - Public (customers can view)
router.get('/banners', getBanners)
// CRUD operations - Admin only
router.post('/banners', isAuthenticated, authorizedRoles('Admin'), createBanner)
router.put('/banners/:bannerId', isAuthenticated, authorizedRoles('Admin'), updateBanner)
router.delete('/banners/:bannerId', isAuthenticated, authorizedRoles('Admin'), deleteBanner)

// ============================================
// GLOBAL SETTINGS
// ============================================
// GET global settings - Public (customers can view)
router.get('/global', getGlobalSettings)
// UPDATE global settings - Admin only
router.post('/global', isAuthenticated, authorizedRoles('Admin'), updateGlobalSettings)

// ============================================
// CATEGORIES (Public - for frontend)
// ============================================
router.get('/categories', getCategories)
// Categories with subcategories - PUBLIC
router.get('/categories-with-subcategories', getCategoriesWithSubcategories_Controller)

// Image Upload (Admin-only alias for settings image uploads)
router.post('/upload', isAuthenticated, authorizedRoles('Admin'), uploadImage)

export default router
