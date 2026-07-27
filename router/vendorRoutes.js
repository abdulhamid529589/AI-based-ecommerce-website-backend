import express from 'express'
import {
  registerVendor,
  getMyShop,
  updateMyShop,
  getVendorProducts,
  createVendorProduct,
  updateVendorProduct,
  deleteVendorProduct,
  getVendorOrders,
  updateVendorOrderStatus,
  getVendorDashboard,
  listPublicShops,
  getPublicShop,
  adminListShops,
  adminUpdateShopStatus,
} from '../controllers/vendorController.js'
import { isAuthenticated, authorizedRoles } from '../middlewares/authMiddleware.js'
import {
  loadVendorShop,
  requireApprovedShop,
  assertProductOwnership,
} from '../middlewares/vendorMiddleware.js'
import { authLimiter } from '../middlewares/securityMiddleware.js'

const router = express.Router()

// ── Public marketplace ───────────────────────────────────────────────────────
router.get('/shops', listPublicShops)
router.get('/shops/:slug', getPublicShop)

// ── Vendor onboarding (public register) ──────────────────────────────────────
router.post('/register', authLimiter, registerVendor)

// ── Vendor authenticated ─────────────────────────────────────────────────────
router.get(
  '/me/shop',
  isAuthenticated,
  authorizedRoles('Vendor'),
  getMyShop,
)
router.put(
  '/me/shop',
  isAuthenticated,
  authorizedRoles('Vendor'),
  loadVendorShop,
  updateMyShop,
)

router.get(
  '/me/dashboard',
  isAuthenticated,
  authorizedRoles('Vendor', 'Admin'),
  loadVendorShop,
  getVendorDashboard,
)

router.get(
  '/me/products',
  isAuthenticated,
  authorizedRoles('Vendor', 'Admin'),
  loadVendorShop,
  getVendorProducts,
)
router.post(
  '/me/products',
  isAuthenticated,
  authorizedRoles('Vendor', 'Admin'),
  loadVendorShop,
  requireApprovedShop,
  createVendorProduct,
)
router.put(
  '/me/products/:productId',
  isAuthenticated,
  authorizedRoles('Vendor', 'Admin'),
  loadVendorShop,
  requireApprovedShop,
  assertProductOwnership,
  updateVendorProduct,
)
router.delete(
  '/me/products/:productId',
  isAuthenticated,
  authorizedRoles('Vendor', 'Admin'),
  loadVendorShop,
  requireApprovedShop,
  assertProductOwnership,
  deleteVendorProduct,
)

router.get(
  '/me/orders',
  isAuthenticated,
  authorizedRoles('Vendor', 'Admin'),
  loadVendorShop,
  getVendorOrders,
)
router.put(
  '/me/orders/:vendorOrderId/status',
  isAuthenticated,
  authorizedRoles('Vendor', 'Admin'),
  loadVendorShop,
  requireApprovedShop,
  updateVendorOrderStatus,
)

// ── Admin shop moderation ────────────────────────────────────────────────────
router.get('/admin/shops', isAuthenticated, authorizedRoles('Admin'), adminListShops)
router.put(
  '/admin/shops/:shopId',
  isAuthenticated,
  authorizedRoles('Admin'),
  adminUpdateShopStatus,
)

export default router
