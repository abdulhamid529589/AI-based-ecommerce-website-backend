import { catchAsyncErrors } from '../middlewares/catchAsyncError.js'
import ErrorHandler from '../middlewares/errorMiddleware.js'
import database from '../database/db.js'
import {
  ensureLoyaltyAccount,
  quoteRedeem,
  POINTS_PER_100_BDT,
  REDEEM_POINTS_PER_BDT,
} from '../utils/loyalty.js'
import { resolvePromoForCart } from '../utils/promoEngine.js'

export const getMyLoyalty = catchAsyncErrors(async (req, res) => {
  await ensureLoyaltyAccount(req.user.id)
  const [acc, txns] = await Promise.all([
    database.query(`SELECT * FROM loyalty_accounts WHERE user_id = $1`, [req.user.id]),
    database.query(
      `SELECT * FROM loyalty_transactions WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 30`,
      [req.user.id],
    ),
  ])

  res.status(200).json({
    success: true,
    loyalty: {
      ...acc.rows[0],
      earn_rate: `৳100 = ${POINTS_PER_100_BDT} pt`,
      redeem_rate: `${REDEEM_POINTS_PER_BDT} pts = ৳1`,
    },
    transactions: txns.rows,
  })
})

export const quoteLoyaltyRedeem = catchAsyncErrors(async (req, res, next) => {
  const points = req.body.points ?? req.query.points
  const quote = await quoteRedeem(req.user.id, points)
  if (!quote.ok) return next(new ErrorHandler(quote.message, 400))
  res.status(200).json({ success: true, quote })
})

/**
 * Preview promo for cart lines (authenticated buyer).
 * Body: { code, items: [{ shop_id, price, quantity }] }
 */
export const previewPromo = catchAsyncErrors(async (req, res, next) => {
  const { code, items } = req.body
  if (!code) return next(new ErrorHandler('Promo code required', 400))
  const lines = Array.isArray(items) ? items : []
  const resolved = await resolvePromoForCart(code, lines, req.user?.id)
  if (!resolved.ok) return next(new ErrorHandler(resolved.message, 400))

  res.status(200).json({
    success: true,
    discount: resolved.discount,
    code: resolved.code,
    shop_id: resolved.shop_id,
    eligibleSubtotal: resolved.eligibleSubtotal,
    description: resolved.promo.description,
  })
})
