import { catchAsyncErrors } from '../middlewares/catchAsyncError.js'
import ErrorHandler from '../middlewares/errorMiddleware.js'
import database from '../database/db.js'
import { withTransaction } from '../utils/transactionHelper.js'
import {
  debitWalletForPayout,
  reversePayoutDebit,
} from '../utils/vendorWallet.js'

const MIN_PAYOUT_BDT = Number(process.env.MIN_VENDOR_PAYOUT || 100)

export const getMyWallet = catchAsyncErrors(async (req, res, next) => {
  if (!req.shop) return next(new ErrorHandler('Shop required.', 400))

  const [txns, pendingEligible, payouts] = await Promise.all([
    database.query(
      `SELECT id, type, amount, direction, balance_after, note, vendor_order_id, payout_id, created_at
       FROM vendor_wallet_transactions
       WHERE shop_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.shop.id],
    ),
    database.query(
      `SELECT COALESCE(SUM(vendor_earning), 0) AS eligible_unpaid
       FROM vendor_orders
       WHERE shop_id = $1 AND payout_status = 'eligible'`,
      [req.shop.id],
    ),
    database.query(
      `SELECT id, amount, status, method, account_ref, notes, created_at, processed_at
       FROM vendor_payouts WHERE shop_id = $1
       ORDER BY created_at DESC LIMIT 20`,
      [req.shop.id],
    ),
  ])

  res.status(200).json({
    success: true,
    wallet: {
      balance: parseFloat(req.shop.wallet_balance || 0),
      currency: 'BDT',
      min_payout: MIN_PAYOUT_BDT,
      kyc_status: req.shop.kyc_status || 'not_submitted',
      payout_method: req.shop.payout_method,
      payout_account: req.shop.payout_account,
      eligible_order_earnings: parseFloat(pendingEligible.rows[0].eligible_unpaid || 0),
    },
    transactions: txns.rows,
    payouts: payouts.rows,
  })
})

export const requestPayout = catchAsyncErrors(async (req, res, next) => {
  if (!req.shop) return next(new ErrorHandler('Shop required.', 400))

  if (req.shop.kyc_status !== 'approved') {
    return next(
      new ErrorHandler('Complete and get KYC approved before requesting a payout.', 403),
    )
  }
  if (!req.shop.payout_account) {
    return next(new ErrorHandler('Set a payout account in shop settings first.', 400))
  }

  const held = await database.query(
    `SELECT COUNT(*)::INT AS c FROM vendor_orders
     WHERE shop_id = $1 AND payout_status = 'held'`,
    [req.shop.id],
  )
  if (held.rows[0].c > 0) {
    return next(
      new ErrorHandler(
        'Payout blocked while you have orders on hold due to open disputes or refunds.',
        403,
      ),
    )
  }

  const amount = Math.round(parseFloat(req.body.amount) * 100) / 100
  if (!amount || amount < MIN_PAYOUT_BDT) {
    return next(new ErrorHandler(`Minimum payout is ৳${MIN_PAYOUT_BDT}.`, 400))
  }

  const balance = parseFloat(req.shop.wallet_balance || 0)
  if (amount > balance) {
    return next(new ErrorHandler('Insufficient wallet balance.', 400))
  }

  // Block duplicate open payouts
  const open = await database.query(
    `SELECT id FROM vendor_payouts
     WHERE shop_id = $1 AND status IN ('pending', 'processing')
     LIMIT 1`,
    [req.shop.id],
  )
  if (open.rows[0]) {
    return next(new ErrorHandler('You already have a payout in progress.', 409))
  }

  let payout
  try {
    payout = await withTransaction(async (tx) => {
      const created = await tx.query(
        `INSERT INTO vendor_payouts (shop_id, amount, currency, status, method, account_ref, notes)
         VALUES ($1, $2, 'BDT', 'pending', $3, $4, $5)
         RETURNING *`,
        [
          req.shop.id,
          amount,
          req.shop.payout_method || 'bkash',
          req.shop.payout_account,
          req.body.notes ? String(req.body.notes).slice(0, 500) : null,
        ],
      )
      const row = created.rows[0]
      await debitWalletForPayout(tx, req.shop.id, amount, row.id, req.user.id)

      // Mark oldest eligible orders as paid against this payout (FIFO cover)
      let remaining = amount
      const eligible = await tx.query(
        `SELECT id, vendor_earning FROM vendor_orders
         WHERE shop_id = $1 AND payout_status = 'eligible'
         ORDER BY updated_at ASC
         FOR UPDATE`,
        [req.shop.id],
      )
      for (const vo of eligible.rows) {
        if (remaining <= 0) break
        const earn = parseFloat(vo.vendor_earning)
        const apply = Math.min(earn, remaining)
        await tx.query(
          `INSERT INTO vendor_payout_items (payout_id, vendor_order_id, amount)
           VALUES ($1, $2, $3)`,
          [row.id, vo.id, apply],
        )
        if (apply >= earn - 0.001) {
          await tx.query(
            `UPDATE vendor_orders SET payout_status = 'paid', updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [vo.id],
          )
        }
        remaining = Math.round((remaining - apply) * 100) / 100
      }

      return row
    })
  } catch (err) {
    if (err.statusCode) return next(new ErrorHandler(err.message, err.statusCode))
    throw err
  }

  res.status(201).json({
    success: true,
    message: 'Payout request submitted.',
    payout,
  })
})

export const listMyPayouts = catchAsyncErrors(async (req, res, next) => {
  if (!req.shop) return next(new ErrorHandler('Shop required.', 400))
  const result = await database.query(
    `SELECT * FROM vendor_payouts WHERE shop_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.shop.id],
  )
  res.status(200).json({ success: true, payouts: result.rows })
})

export const adminListPayouts = catchAsyncErrors(async (req, res) => {
  const status = req.query.status
  const values = []
  let where = ''
  if (status) {
    values.push(status)
    where = 'WHERE vp.status = $1'
  }

  const result = await database.query(
    `SELECT vp.*, s.name AS shop_name, s.slug AS shop_slug
     FROM vendor_payouts vp
     JOIN shops s ON s.id = vp.shop_id
     ${where}
     ORDER BY vp.created_at DESC
     LIMIT 100`,
    values,
  )

  res.status(200).json({ success: true, payouts: result.rows })
})

export const adminUpdatePayout = catchAsyncErrors(async (req, res, next) => {
  const { status, notes } = req.body
  const allowed = ['processing', 'completed', 'failed', 'cancelled']
  if (!allowed.includes(status)) {
    return next(new ErrorHandler(`Status must be one of: ${allowed.join(', ')}`, 400))
  }

  const existing = await database.query(`SELECT * FROM vendor_payouts WHERE id = $1`, [
    req.params.payoutId,
  ])
  if (!existing.rows[0]) return next(new ErrorHandler('Payout not found.', 404))
  const payout = existing.rows[0]

  if (['completed', 'failed', 'cancelled'].includes(payout.status)) {
    return next(new ErrorHandler(`Payout already ${payout.status}.`, 400))
  }

  const updated = await withTransaction(async (tx) => {
    if (status === 'failed' || status === 'cancelled') {
      await reversePayoutDebit(tx, payout.shop_id, payout.amount, payout.id, req.user.id)
      // Re-open linked vendor orders
      await tx.query(
        `UPDATE vendor_orders vo
         SET payout_status = 'eligible', updated_at = CURRENT_TIMESTAMP
         FROM vendor_payout_items vpi
         WHERE vpi.payout_id = $1 AND vpi.vendor_order_id = vo.id`,
        [payout.id],
      )
    }

    const result = await tx.query(
      `UPDATE vendor_payouts SET
         status = $1,
         notes = COALESCE($2, notes),
         processed_by = $3,
         processed_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [status, notes ? String(notes).slice(0, 500) : null, req.user.id, payout.id],
    )
    return result.rows[0]
  })

  res.status(200).json({
    success: true,
    message: `Payout marked ${status}.`,
    payout: updated,
  })
})
