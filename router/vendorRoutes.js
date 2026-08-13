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
  getVendorAnalytics,
  listPublicShops,
  getPublicShop,
  adminListShops,
  adminUpdateShopStatus,
} from '../controllers/vendorController.js'
import { getMyKyc, submitMyKyc, adminReviewKyc } from '../controllers/vendorKycController.js'
import {
  getMyWallet,
  requestPayout,
  listMyPayouts,
  adminListPayouts,
  adminUpdatePayout,
} from '../controllers/vendorWalletController.js'
import {
  listVendorDisputes,
  vendorRespondDispute,
} from '../controllers/disputeController.js'
import {
  createPromotion,
  listShopPromotions,
  deleteShopPromotion,
} from '../controllers/promotionController.js'
import { isAuthenticated, authorizedRoles } from '../middlewares/authMiddleware.js'
import {
  loadVendorShop,
  requireApprovedShop,
  assertProductOwnership,
} from '../middlewares/vendorMiddleware.js'
import { authLimiter, strictLimiter } from '../middlewares/securityMiddleware.js'

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
  '/me/analytics',
  isAuthenticated,
  authorizedRoles('Vendor', 'Admin'),
  loadVendorShop,
  getVendorAnalytics,
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

// ── KYC ──────────────────────────────────────────────────────────────────────
router.get(
  '/me/kyc',
  isAuthenticated,
  authorizedRoles('Vendor'),
  loadVendorShop,
  getMyKyc,
)
router.post(
  '/me/kyc',
  isAuthenticated,
  authorizedRoles('Vendor'),
  loadVendorShop,
  strictLimiter,
  submitMyKyc,
)

// ── Wallet & payouts ─────────────────────────────────────────────────────────
router.get(
  '/me/wallet',
  isAuthenticated,
  authorizedRoles('Vendor', 'Admin'),
  loadVendorShop,
  getMyWallet,
)
router.get(
  '/me/payouts',
  isAuthenticated,
  authorizedRoles('Vendor', 'Admin'),
  loadVendorShop,
  listMyPayouts,
)
router.post(
  '/me/payouts',
  isAuthenticated,
  authorizedRoles('Vendor'),
  loadVendorShop,
  requireApprovedShop,
  strictLimiter,
  requestPayout,
)

router.get(
  '/me/disputes',
  isAuthenticated,
  authorizedRoles('Vendor', 'Admin'),
  loadVendorShop,
  listVendorDisputes,
)
router.put(
  '/me/disputes/:disputeId',
  isAuthenticated,
  authorizedRoles('Vendor'),
  loadVendorShop,
  requireApprovedShop,
  vendorRespondDispute,
)

router.get(
  '/me/promotions',
  isAuthenticated,
  authorizedRoles('Vendor', 'Admin'),
  loadVendorShop,
  listShopPromotions,
)
router.post(
  '/me/promotions',
  isAuthenticated,
  authorizedRoles('Vendor'),
  loadVendorShop,
  requireApprovedShop,
  createPromotion,
)
router.delete(
  '/me/promotions/:promotionId',
  isAuthenticated,
  authorizedRoles('Vendor'),
  loadVendorShop,
  requireApprovedShop,
  deleteShopPromotion,
)

// ── Admin shop moderation ────────────────────────────────────────────────────
router.get('/admin/shops', isAuthenticated, authorizedRoles('Admin'), adminListShops)
router.put(
  '/admin/shops/:shopId',
  isAuthenticated,
  authorizedRoles('Admin'),
  adminUpdateShopStatus,
)
router.put(
  '/admin/shops/:shopId/kyc',
  isAuthenticated,
  authorizedRoles('Admin'),
  adminReviewKyc,
)
router.get('/admin/payouts', isAuthenticated, authorizedRoles('Admin'), adminListPayouts)
router.put(
  '/admin/payouts/:payoutId',
  isAuthenticated,
  authorizedRoles('Admin'),
  adminUpdatePayout,
)

export default router
