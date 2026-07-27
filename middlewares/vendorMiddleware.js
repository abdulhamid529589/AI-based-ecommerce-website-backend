import { catchAsyncErrors } from './catchAsyncError.js'
import ErrorHandler from './errorMiddleware.js'
import database from '../database/db.js'

/**
 * Load the authenticated vendor's shop onto req.shop.
 * Admins may pass ?shopId= or body.shop_id to act on a specific shop.
 */
export const loadVendorShop = catchAsyncErrors(async (req, res, next) => {
  if (!req.user?.id) {
    return next(new ErrorHandler('Authentication required.', 401))
  }

  // Admin impersonation / management of a specific shop
  if (req.user.role === 'Admin') {
    const shopId = req.params.shopId || req.query.shopId || req.body?.shop_id
    if (shopId) {
      const result = await database.query('SELECT * FROM shops WHERE id = $1', [shopId])
      if (!result.rows[0]) {
        return next(new ErrorHandler('Shop not found.', 404))
      }
      req.shop = result.rows[0]
      req.isAdminActingAsVendor = true
      return next()
    }
    // Admin without shop context — allow through; handlers decide
    req.shop = null
    req.isAdminActingAsVendor = true
    return next()
  }

  if (req.user.role !== 'Vendor') {
    return next(new ErrorHandler('Vendor access only.', 403))
  }

  const result = await database.query('SELECT * FROM shops WHERE owner_id = $1', [req.user.id])
  if (!result.rows[0]) {
    return next(new ErrorHandler('No shop found. Complete vendor onboarding first.', 404))
  }

  req.shop = result.rows[0]
  next()
})

/**
 * Require an approved (active) shop before selling / mutating catalog.
 */
export const requireApprovedShop = (req, res, next) => {
  if (req.user?.role === 'Admin' && !req.shop) {
    return next()
  }

  if (!req.shop) {
    return next(new ErrorHandler('Shop context required.', 400))
  }

  if (req.shop.status === 'suspended') {
    return next(new ErrorHandler('Your shop is suspended. Contact support.', 403))
  }

  if (req.shop.status === 'rejected') {
    return next(new ErrorHandler('Your shop application was rejected.', 403))
  }

  if (req.shop.status !== 'approved' && req.user?.role !== 'Admin') {
    return next(new ErrorHandler('Shop pending approval. You cannot sell yet.', 403))
  }

  next()
}

/**
 * Ensure a product belongs to the vendor's shop (or Admin).
 */
export const assertProductOwnership = catchAsyncErrors(async (req, res, next) => {
  if (req.user?.role === 'Admin') return next()

  const productId = req.params.productId || req.params.id
  if (!productId || !req.shop?.id) {
    return next(new ErrorHandler('Product ownership check failed.', 400))
  }

  const result = await database.query('SELECT id, shop_id FROM products WHERE id = $1', [productId])
  if (!result.rows[0]) {
    return next(new ErrorHandler('Product not found.', 404))
  }

  if (result.rows[0].shop_id !== req.shop.id) {
    return next(new ErrorHandler('You can only manage your own products.', 403))
  }

  next()
})
