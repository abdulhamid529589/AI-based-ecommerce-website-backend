import express from 'express'
import {
  getRevenueMetrics,
  getRevenueChart,
  getRevenueComparison,
  getTopProducts,
  getProductPerformance,
  getCategoryPerformance,
  getCustomerSegments,
  getCustomerLifetimeValue,
  getCohortAnalysis,
  getOrderMetrics,
  getOrderStatusDistribution,
  getOrderPeakTimes,
  getInventoryAnalytics,
  getConversionFunnel,
  getReviewAnalytics,
  getDashboardSummary,
} from '../controllers/dashboardAnalyticsController.js'
import { isAuthenticated, authorizedRoles } from '../middlewares/authMiddleware.js'

const router = express.Router()

// ===== DASHBOARD SUMMARY =====
router.get('/summary', isAuthenticated, authorizedRoles('Admin'), getDashboardSummary)

// ===== REVENUE ANALYTICS =====
router.get('/revenue/metrics', isAuthenticated, authorizedRoles('Admin'), getRevenueMetrics)
router.get('/revenue/chart', isAuthenticated, authorizedRoles('Admin'), getRevenueChart)
router.get('/revenue/comparison', isAuthenticated, authorizedRoles('Admin'), getRevenueComparison)

// ===== PRODUCT ANALYTICS =====
router.get('/products/top', isAuthenticated, authorizedRoles('Admin'), getTopProducts)
router.get(
  '/products/:productId/performance',
  isAuthenticated,
  authorizedRoles('Admin'),
  getProductPerformance,
)
router.get(
  '/products/by-category',
  isAuthenticated,
  authorizedRoles('Admin'),
  getCategoryPerformance,
)
router.get(
  '/products/categories/performance',
  isAuthenticated,
  authorizedRoles('Admin'),
  getCategoryPerformance,
)

// ===== CUSTOMER ANALYTICS =====
router.get('/customers/segments', isAuthenticated, authorizedRoles('Admin'), getCustomerSegments)
router.get('/customers/ltv', isAuthenticated, authorizedRoles('Admin'), getCustomerLifetimeValue)
router.get('/customers/cohorts', isAuthenticated, authorizedRoles('Admin'), getCohortAnalysis)

// ===== ORDER ANALYTICS =====
router.get('/orders/metrics', isAuthenticated, authorizedRoles('Admin'), getOrderMetrics)
router.get(
  '/orders/status-distribution',
  isAuthenticated,
  authorizedRoles('Admin'),
  getOrderStatusDistribution,
)
router.get('/orders/peak-times', isAuthenticated, authorizedRoles('Admin'), getOrderPeakTimes)

// ===== INVENTORY ANALYTICS =====
router.get('/inventory', isAuthenticated, authorizedRoles('Admin'), getInventoryAnalytics)

// ===== CONVERSION ANALYTICS =====
router.get('/conversion/funnel', isAuthenticated, authorizedRoles('Admin'), getConversionFunnel)

// ===== REVIEW ANALYTICS =====
router.get('/reviews', isAuthenticated, authorizedRoles('Admin'), getReviewAnalytics)

export default router
