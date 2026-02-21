import ErrorHandler from '../middlewares/errorMiddleware.js'
import { catchAsyncErrors } from '../middlewares/catchAsyncError.js'
import database from '../database/db.js'

/**
 * Get all promotions
 * GET /api/v1/admin/promotions
 */
export const getPromotions = catchAsyncErrors(async (req, res, next) => {
  const { status, search } = req.query
  const page = parseInt(req.query.page) || 1
  const limit = parseInt(req.query.limit) || 10
  const offset = (page - 1) * limit

  let query = 'SELECT * FROM promotions'
  let values = []
  let conditions = []

  // Filter by active/inactive
  if (status === 'active') {
    conditions.push('is_active = true AND expiry_date > NOW()')
  } else if (status === 'inactive') {
    conditions.push('is_active = false OR expiry_date <= NOW()')
  } else if (status === 'expired') {
    conditions.push('expiry_date <= NOW()')
  }

  // Search by code or description
  if (search) {
    conditions.push('(code ILIKE $1 OR description ILIKE $1)')
    values.push(`%${search}%`)
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ')
  }

  query +=
    ' ORDER BY created_at DESC LIMIT $' + (values.length + 1) + ' OFFSET $' + (values.length + 2)
  values.push(limit, offset)

  // Get total count
  let countQuery = 'SELECT COUNT(*) FROM promotions'
  if (conditions.length > 0) {
    countQuery += ' WHERE ' + conditions.join(' AND ')
  }

  const countResult = await database.query(
    countQuery,
    conditions.length > 0 && search ? [`%${search}%`] : [],
  )
  const total = parseInt(countResult.rows[0].count)

  const result = await database.query(query, values)

  res.status(200).json({
    success: true,
    promotions: result.rows,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  })
})

/**
 * Get single promotion
 * GET /api/v1/admin/promotions/:promotionId
 */
export const getPromotion = catchAsyncErrors(async (req, res, next) => {
  const { promotionId } = req.params

  const result = await database.query('SELECT * FROM promotions WHERE id = $1', [promotionId])

  if (result.rows.length === 0) {
    return next(new ErrorHandler('Promotion not found', 404))
  }

  res.status(200).json({
    success: true,
    promotion: result.rows[0],
  })
})

/**
 * Create promotion
 * POST /api/v1/admin/promotions
 */
export const createPromotion = catchAsyncErrors(async (req, res, next) => {
  const {
    code,
    type,
    value,
    minOrderValue = 0,
    maxUses,
    expiryDate,
    description,
    isActive = true,
  } = req.body

  // Validation
  if (!code || !type || !value) {
    return next(new ErrorHandler('Code, type, and value are required', 400))
  }

  if (!['percentage', 'fixed'].includes(type)) {
    return next(new ErrorHandler('Type must be "percentage" or "fixed"', 400))
  }

  if (type === 'percentage' && (value < 0 || value > 100)) {
    return next(new ErrorHandler('Percentage value must be between 0 and 100', 400))
  }

  if (value <= 0) {
    return next(new ErrorHandler('Value must be greater than 0', 400))
  }

  // Check if code already exists
  const existing = await database.query('SELECT id FROM promotions WHERE code = $1', [code])
  if (existing.rows.length > 0) {
    return next(new ErrorHandler('Promotion code already exists', 400))
  }

  const query = `
    INSERT INTO promotions (code, type, value, min_order_value, max_uses, expiry_date, description, is_active, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `

  const result = await database.query(query, [
    code.toUpperCase(),
    type,
    value,
    minOrderValue,
    maxUses,
    expiryDate,
    description,
    isActive,
    req.user.id,
  ])

  res.status(201).json({
    success: true,
    message: 'Promotion created successfully',
    promotion: result.rows[0],
  })
})

/**
 * Update promotion
 * PUT /api/v1/admin/promotions/:promotionId
 */
export const updatePromotion = catchAsyncErrors(async (req, res, next) => {
  const { promotionId } = req.params
  const { code, type, value, minOrderValue, maxUses, expiryDate, description, isActive } = req.body

  // Check if promotion exists
  const existing = await database.query('SELECT * FROM promotions WHERE id = $1', [promotionId])
  if (existing.rows.length === 0) {
    return next(new ErrorHandler('Promotion not found', 404))
  }

  // Check if new code already exists (if code is being changed)
  if (code && code !== existing.rows[0].code) {
    const codeExists = await database.query('SELECT id FROM promotions WHERE code = $1', [code])
    if (codeExists.rows.length > 0) {
      return next(new ErrorHandler('Promotion code already exists', 400))
    }
  }

  // Validate type if provided
  if (type && !['percentage', 'fixed'].includes(type)) {
    return next(new ErrorHandler('Type must be "percentage" or "fixed"', 400))
  }

  // Validate value if provided
  if (value !== undefined) {
    if (value <= 0) {
      return next(new ErrorHandler('Value must be greater than 0', 400))
    }
    const promoType = type || existing.rows[0].type
    if (promoType === 'percentage' && (value < 0 || value > 100)) {
      return next(new ErrorHandler('Percentage value must be between 0 and 100', 400))
    }
  }

  const updateFields = []
  const values = []
  let paramIndex = 1

  if (code !== undefined) {
    updateFields.push(`code = $${paramIndex++}`)
    values.push(code.toUpperCase())
  }
  if (type !== undefined) {
    updateFields.push(`type = $${paramIndex++}`)
    values.push(type)
  }
  if (value !== undefined) {
    updateFields.push(`value = $${paramIndex++}`)
    values.push(value)
  }
  if (minOrderValue !== undefined) {
    updateFields.push(`min_order_value = $${paramIndex++}`)
    values.push(minOrderValue)
  }
  if (maxUses !== undefined) {
    updateFields.push(`max_uses = $${paramIndex++}`)
    values.push(maxUses)
  }
  if (expiryDate !== undefined) {
    updateFields.push(`expiry_date = $${paramIndex++}`)
    values.push(expiryDate)
  }
  if (description !== undefined) {
    updateFields.push(`description = $${paramIndex++}`)
    values.push(description)
  }
  if (isActive !== undefined) {
    updateFields.push(`is_active = $${paramIndex++}`)
    values.push(isActive)
  }

  updateFields.push(`updated_at = NOW()`)

  values.push(promotionId)

  const query = `
    UPDATE promotions
    SET ${updateFields.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *
  `

  const result = await database.query(query, values)

  res.status(200).json({
    success: true,
    message: 'Promotion updated successfully',
    promotion: result.rows[0],
  })
})

/**
 * Delete promotion
 * DELETE /api/v1/admin/promotions/:promotionId
 */
export const deletePromotion = catchAsyncErrors(async (req, res, next) => {
  const { promotionId } = req.params

  const result = await database.query('DELETE FROM promotions WHERE id = $1 RETURNING id', [
    promotionId,
  ])

  if (result.rows.length === 0) {
    return next(new ErrorHandler('Promotion not found', 404))
  }

  res.status(200).json({
    success: true,
    message: 'Promotion deleted successfully',
  })
})

/**
 * Validate promotion code
 * GET /api/v1/promotions/validate/:code
 */
export const validatePromotionCode = catchAsyncErrors(async (req, res, next) => {
  const { code } = req.params
  const { orderValue = 0 } = req.query

  const result = await database.query(
    `
    SELECT * FROM promotions
    WHERE code = $1
    AND is_active = true
    AND (expiry_date IS NULL OR expiry_date > NOW())
    AND (max_uses IS NULL OR used_count < max_uses)
  `,
    [code.toUpperCase()],
  )

  if (result.rows.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or expired promotion code',
    })
  }

  const promotion = result.rows[0]

  // Check minimum order value
  if (promotion.min_order_value && parseFloat(orderValue) < parseFloat(promotion.min_order_value)) {
    return res.status(400).json({
      success: false,
      message: `Minimum order value is $${promotion.min_order_value}`,
    })
  }

  // Calculate discount
  let discountAmount = 0
  if (promotion.type === 'percentage') {
    discountAmount = (parseFloat(orderValue) * promotion.value) / 100
  } else {
    discountAmount = parseFloat(promotion.value)
  }

  res.status(200).json({
    success: true,
    message: 'Promotion code is valid',
    promotion: {
      id: promotion.id,
      code: promotion.code,
      type: promotion.type,
      value: promotion.value,
      description: promotion.description,
      discountAmount: discountAmount,
    },
  })
})

/**
 * Apply promotion to order
 * POST /api/v1/promotions/apply
 */
export const applyPromotion = catchAsyncErrors(async (req, res, next) => {
  const { code } = req.body

  if (!code) {
    return next(new ErrorHandler('Promotion code is required', 400))
  }

  // Validate and get promotion
  const result = await database.query(
    `
    SELECT * FROM promotions
    WHERE code = $1
    AND is_active = true
    AND (expiry_date IS NULL OR expiry_date > NOW())
  `,
    [code.toUpperCase()],
  )

  if (result.rows.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or expired promotion code',
    })
  }

  const promotion = result.rows[0]

  // Check max uses
  if (promotion.max_uses && promotion.used_count >= promotion.max_uses) {
    return res.status(400).json({
      success: false,
      message: 'This promotion code has reached its usage limit',
    })
  }

  res.status(200).json({
    success: true,
    message: 'Promotion applied successfully',
    promotion: {
      id: promotion.id,
      code: promotion.code,
      type: promotion.type,
      value: promotion.value,
      description: promotion.description,
    },
  })
})

/**
 * Get promotion analytics
 * GET /api/v1/admin/promotions/:promotionId/analytics
 */
export const getPromotionAnalytics = catchAsyncErrors(async (req, res, next) => {
  const { promotionId } = req.params

  const promotionQuery = await database.query('SELECT * FROM promotions WHERE id = $1', [
    promotionId,
  ])

  if (promotionQuery.rows.length === 0) {
    return next(new ErrorHandler('Promotion not found', 404))
  }

  const promotion = promotionQuery.rows[0]

  // Get usage stats from orders (if integration exists)
  // For now, return basic stats
  const stats = {
    id: promotion.id,
    code: promotion.code,
    type: promotion.type,
    value: promotion.value,
    totalUses: promotion.used_count,
    maxUses: promotion.max_uses,
    remainingUses: promotion.max_uses ? promotion.max_uses - promotion.used_count : 'Unlimited',
    isActive: promotion.is_active,
    createdAt: promotion.created_at,
    expiryDate: promotion.expiry_date,
    isExpired: promotion.expiry_date && new Date(promotion.expiry_date) < new Date(),
  }

  res.status(200).json({
    success: true,
    analytics: stats,
  })
})

export default {
  getPromotions,
  getPromotion,
  createPromotion,
  updatePromotion,
  deletePromotion,
  validatePromotionCode,
  applyPromotion,
  getPromotionAnalytics,
}
