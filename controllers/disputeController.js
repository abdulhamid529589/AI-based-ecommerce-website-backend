import { catchAsyncErrors } from '../middlewares/catchAsyncError.js'
import ErrorHandler from '../middlewares/errorMiddleware.js'
import database from '../database/db.js'
import { withTransaction } from '../utils/transactionHelper.js'
import { createNotificationRecord } from './notificationController.js'
import { creditVendorOrderEarning } from '../utils/vendorWallet.js'

const sanitize = (str) => {
  if (typeof str !== 'string') return str
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .trim()
}

const REASONS = ['not_received', 'damaged', 'wrong_item', 'not_as_described', 'other']
const OPEN_STATUSES = ['open', 'vendor_review', 'escalated']

async function holdVendorOrderPayout(txOrDb, vendorOrderId) {
  await txOrDb.query(
    `UPDATE vendor_orders SET payout_status = 'held', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND payout_status IN ('pending', 'eligible')`,
    [vendorOrderId],
  )
}

async function releaseHoldIfResolved(txOrDb, vendorOrderId, resolution, userId = null) {
  // Keep held if refund path; else restore and try wallet credit
  if (resolution === 'full_refund' || resolution === 'partial_refund') {
    return
  }
  await txOrDb.query(
    `UPDATE vendor_orders SET
       payout_status = CASE
         WHEN status = 'Delivered' THEN 'eligible'
         ELSE 'pending'
       END,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND payout_status = 'held'`,
    [vendorOrderId],
  )
  await creditVendorOrderEarning(txOrDb, vendorOrderId, userId)
}

export const openDispute = catchAsyncErrors(async (req, res, next) => {
  const { order_id, vendor_order_id, reason, description, evidence } = req.body

  if (!order_id || !reason || !description) {
    return next(new ErrorHandler('order_id, reason, and description are required', 400))
  }
  if (!REASONS.includes(reason)) {
    return next(new ErrorHandler(`reason must be one of: ${REASONS.join(', ')}`, 400))
  }
  if (String(description).trim().length < 10) {
    return next(new ErrorHandler('Please describe the issue (at least 10 characters).', 400))
  }

  const order = await database.query(`SELECT * FROM orders WHERE id = $1`, [order_id])
  if (!order.rows[0]) return next(new ErrorHandler('Order not found', 404))
  if (req.user.role !== 'Admin' && order.rows[0].buyer_id !== req.user.id) {
    return next(new ErrorHandler('Not authorized for this order', 403))
  }

  let shopId = null
  let vendorOrderId = vendor_order_id || null
  if (vendorOrderId) {
    const vo = await database.query(
      `SELECT * FROM vendor_orders WHERE id = $1 AND order_id = $2`,
      [vendorOrderId, order_id],
    )
    if (!vo.rows[0]) return next(new ErrorHandler('Vendor order not found on this order', 404))
    shopId = vo.rows[0].shop_id
  }

  // One open dispute per vendor_order (or order if platform)
  const existing = await database.query(
    `SELECT id FROM order_disputes
     WHERE order_id = $1
       AND status = ANY($2::text[])
       AND (
         ($3::uuid IS NOT NULL AND vendor_order_id = $3)
         OR ($3::uuid IS NULL AND vendor_order_id IS NULL)
       )
     LIMIT 1`,
    [order_id, OPEN_STATUSES, vendorOrderId],
  )
  if (existing.rows[0]) {
    return next(new ErrorHandler('An open dispute already exists for this shipment.', 409))
  }

  const evidenceArr = Array.isArray(evidence)
    ? evidence.slice(0, 5).map((e) => ({
        url: String(e.url || e).slice(0, 2000),
        note: e.note ? String(e.note).slice(0, 200) : null,
      }))
    : []

  const dispute = await withTransaction(async (tx) => {
    const created = await tx.query(
      `INSERT INTO order_disputes (
         order_id, vendor_order_id, shop_id, opened_by, reason, description, status, evidence
       ) VALUES ($1,$2,$3,$4,$5,$6,'open',$7)
       RETURNING *`,
      [
        order_id,
        vendorOrderId,
        shopId,
        req.user.id,
        reason,
        sanitize(description),
        JSON.stringify(evidenceArr),
      ],
    )
    if (vendorOrderId) {
      await holdVendorOrderPayout(tx, vendorOrderId)
    }
    return created.rows[0]
  })

  // Notify vendor owner
  if (shopId) {
    const shop = await database.query(`SELECT owner_id, name FROM shops WHERE id = $1`, [shopId])
    if (shop.rows[0]?.owner_id) {
      try {
        await createNotificationRecord({
          userId: shop.rows[0].owner_id,
          type: 'dispute',
          title: 'New order dispute',
          message: `A buyer opened a dispute on ${shop.rows[0].name}: ${reason}`,
          data: { disputeId: dispute.id, orderId: order_id },
          priority: 'high',
        })
      } catch (err) {
        console.warn('Dispute notify failed:', err.message)
      }
    }
  }

  res.status(201).json({
    success: true,
    message: 'Dispute opened. Payout held pending review.',
    dispute,
  })
})

export const listMyDisputes = catchAsyncErrors(async (req, res) => {
  const result = await database.query(
    `SELECT d.*, s.name AS shop_name
     FROM order_disputes d
     LEFT JOIN shops s ON s.id = d.shop_id
     WHERE d.opened_by = $1
     ORDER BY d.created_at DESC
     LIMIT 50`,
    [req.user.id],
  )
  res.status(200).json({ success: true, disputes: result.rows })
})

export const listVendorDisputes = catchAsyncErrors(async (req, res, next) => {
  if (!req.shop) return next(new ErrorHandler('Shop required', 400))
  const result = await database.query(
    `SELECT d.*, u.name AS buyer_name
     FROM order_disputes d
     LEFT JOIN users u ON u.id = d.opened_by
     WHERE d.shop_id = $1
     ORDER BY d.created_at DESC
     LIMIT 50`,
    [req.shop.id],
  )
  res.status(200).json({ success: true, disputes: result.rows })
})

export const listAdminDisputes = catchAsyncErrors(async (req, res) => {
  const status = req.query.status
  const values = []
  let where = ''
  if (status) {
    values.push(status)
    where = 'WHERE d.status = $1'
  }
  const result = await database.query(
    `SELECT d.*, s.name AS shop_name, u.name AS buyer_name
     FROM order_disputes d
     LEFT JOIN shops s ON s.id = d.shop_id
     LEFT JOIN users u ON u.id = d.opened_by
     ${where}
     ORDER BY d.created_at DESC
     LIMIT 100`,
    values,
  )
  res.status(200).json({ success: true, disputes: result.rows })
})

export const vendorRespondDispute = catchAsyncErrors(async (req, res, next) => {
  if (!req.shop) return next(new ErrorHandler('Shop required', 400))
  const { vendor_response, escalate } = req.body
  if (!vendor_response || String(vendor_response).trim().length < 5) {
    return next(new ErrorHandler('vendor_response is required', 400))
  }

  const existing = await database.query(
    `SELECT * FROM order_disputes WHERE id = $1 AND shop_id = $2`,
    [req.params.disputeId, req.shop.id],
  )
  if (!existing.rows[0]) return next(new ErrorHandler('Dispute not found', 404))
  if (!OPEN_STATUSES.includes(existing.rows[0].status)) {
    return next(new ErrorHandler('Dispute is already closed', 400))
  }

  const nextStatus = escalate ? 'escalated' : 'vendor_review'
  const result = await database.query(
    `UPDATE order_disputes SET
       vendor_response = $1,
       status = $2,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $3
     RETURNING *`,
    [sanitize(vendor_response), nextStatus, req.params.disputeId],
  )

  try {
    await createNotificationRecord({
      userId: existing.rows[0].opened_by,
      type: 'dispute',
      title: 'Seller responded to your dispute',
      message: String(vendor_response).slice(0, 140),
      data: { disputeId: result.rows[0].id },
      priority: 'normal',
    })
  } catch {
    /* ignore */
  }

  res.status(200).json({ success: true, dispute: result.rows[0] })
})

export const resolveDispute = catchAsyncErrors(async (req, res, next) => {
  const {
    status,
    resolution,
    refund_amount,
    admin_note,
  } = req.body

  const allowedStatus = ['resolved', 'rejected', 'closed', 'escalated']
  if (!allowedStatus.includes(status)) {
    return next(new ErrorHandler(`status must be one of: ${allowedStatus.join(', ')}`, 400))
  }

  const existing = await database.query(`SELECT * FROM order_disputes WHERE id = $1`, [
    req.params.disputeId,
  ])
  if (!existing.rows[0]) return next(new ErrorHandler('Dispute not found', 404))
  const dispute = existing.rows[0]

  if (req.user.role !== 'Admin') {
    return next(new ErrorHandler('Admin only', 403))
  }

  const result = await withTransaction(async (tx) => {
    const updated = await tx.query(
      `UPDATE order_disputes SET
         status = $1,
         resolution = COALESCE($2, resolution),
         refund_amount = COALESCE($3, refund_amount),
         admin_note = COALESCE($4, admin_note),
         resolved_by = $5,
         resolved_at = CASE WHEN $1 IN ('resolved','rejected','closed') THEN CURRENT_TIMESTAMP ELSE resolved_at END,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [
        status,
        resolution || null,
        refund_amount != null ? parseFloat(refund_amount) : null,
        admin_note ? sanitize(admin_note) : null,
        req.user.id,
        dispute.id,
      ],
    )

    const row = updated.rows[0]
    const resAmount = parseFloat(row.refund_amount || 0)

    // Create refund record + debit vendor wallet for refund resolutions
    if (
      status === 'resolved' &&
      (resolution === 'full_refund' || resolution === 'partial_refund') &&
      resAmount > 0
    ) {
      await tx.query(
        `INSERT INTO order_refunds (order_id, dispute_id, amount, status, method, reason, processed_by, processed_at)
         VALUES ($1, $2, $3, 'completed', 'original', $4, $5, CURRENT_TIMESTAMP)`,
        [
          dispute.order_id,
          dispute.id,
          resAmount,
          row.reason,
          req.user.id,
        ],
      )

      if (dispute.vendor_order_id && dispute.shop_id) {
        const shopBal = await tx.query(
          `SELECT wallet_balance FROM shops WHERE id = $1 FOR UPDATE`,
          [dispute.shop_id],
        )
        const balance = parseFloat(shopBal.rows[0]?.wallet_balance || 0)
        const debit = Math.min(balance, resAmount)
        if (debit > 0) {
          const balanceAfter = Math.round((balance - debit) * 100) / 100
          await tx.query(
            `UPDATE shops SET wallet_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [balanceAfter, dispute.shop_id],
          )
          await tx.query(
            `INSERT INTO vendor_wallet_transactions
               (shop_id, vendor_order_id, type, amount, direction, balance_after, note, created_by)
             VALUES ($1, $2, 'refund_debit', $3, 'debit', $4, $5, $6)`,
            [
              dispute.shop_id,
              dispute.vendor_order_id,
              debit,
              balanceAfter,
              `Dispute refund ${dispute.id}`,
              req.user.id,
            ],
          )
        }
        await tx.query(
          `UPDATE vendor_orders SET payout_status = 'held', updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [dispute.vendor_order_id],
        )
      }
    } else if (status === 'resolved' || status === 'rejected' || status === 'closed') {
      if (dispute.vendor_order_id) {
        await releaseHoldIfResolved(tx, dispute.vendor_order_id, resolution, req.user.id)
      }
    }

    return row
  })

  try {
    await createNotificationRecord({
      userId: dispute.opened_by,
      type: 'dispute',
      title: `Dispute ${status}`,
      message: admin_note || `Your dispute was marked ${status}.`,
      data: { disputeId: dispute.id },
      priority: 'high',
    })
  } catch {
    /* ignore */
  }

  res.status(200).json({ success: true, dispute: result })
})
