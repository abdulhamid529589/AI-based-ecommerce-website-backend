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
} from '../controllers/contentController.js'
import { isAuthenticated, authorizedRoles } from '../middlewares/authMiddleware.js'

const router = express.Router()

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
// FOOTER CONTENT (Admin Only)
// ============================================
router.get('/footer', isAuthenticated, authorizedRoles('Admin'), getFooterContent)
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

export default router
