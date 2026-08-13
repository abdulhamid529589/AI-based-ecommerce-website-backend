/**
 * Vendor wallet ledger helpers — credit earnings / debit payouts inside a transaction client.
 * `tx` must expose `.query(sql, params)` (TransactionHelper or pg client wrapper).
 */

const queryFn = (txOrDb) => (sql, params) => txOrDb.query(sql, params)

/**
 * Credit vendor_earning to shop wallet when order is Delivered AND payment is Paid.
 * Idempotent via unique index on earning_credit + vendor_order_id.
 * @returns {Promise<{ credited: boolean, amount?: number, balance?: number }>}
 */
export async function creditVendorOrderEarning(txOrDb, vendorOrderId, createdBy = null) {
  const q = queryFn(txOrDb)

  const voRes = await q(
    `SELECT vo.* FROM vendor_orders vo WHERE vo.id = $1 FOR UPDATE`,
    [vendorOrderId],
  )
  const vo = voRes.rows[0]
  if (!vo) return { credited: false, reason: 'not_found' }
  if (vo.status !== 'Delivered') return { credited: false, reason: 'not_delivered' }

  const payRes = await q(`SELECT payment_status FROM payments WHERE order_id = $1`, [
    vo.order_id,
  ])
  const paymentStatus = payRes.rows[0]?.payment_status
  if (paymentStatus !== 'Paid') return { credited: false, reason: 'not_paid' }
  if (vo.payout_status === 'paid' || vo.payout_status === 'held') {
    return { credited: false, reason: 'already_settled' }
  }

  const existing = await q(
    `SELECT id FROM vendor_wallet_transactions
     WHERE vendor_order_id = $1 AND type = 'earning_credit'`,
    [vendorOrderId],
  )
  if (existing.rows[0]) {
    await q(
      `UPDATE vendor_orders SET payout_status = 'eligible', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND payout_status = 'pending'`,
      [vendorOrderId],
    )
    return { credited: false, reason: 'already_credited' }
  }

  const amount = Math.round(parseFloat(vo.vendor_earning) * 100) / 100
  if (!(amount > 0)) return { credited: false, reason: 'zero_amount' }

  const shopRes = await q(`SELECT wallet_balance FROM shops WHERE id = $1 FOR UPDATE`, [
    vo.shop_id,
  ])
  const balance = parseFloat(shopRes.rows[0]?.wallet_balance || 0)
  const balanceAfter = Math.round((balance + amount) * 100) / 100

  await q(`UPDATE shops SET wallet_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [
    balanceAfter,
    vo.shop_id,
  ])

  await q(
    `INSERT INTO vendor_wallet_transactions
       (shop_id, vendor_order_id, type, amount, direction, balance_after, note, created_by)
     VALUES ($1, $2, 'earning_credit', $3, 'credit', $4, $5, $6)`,
    [
      vo.shop_id,
      vendorOrderId,
      amount,
      balanceAfter,
      `Earning for vendor order ${vendorOrderId}`,
      createdBy,
    ],
  )

  await q(
    `UPDATE vendor_orders SET payout_status = 'eligible', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [vendorOrderId],
  )

  return { credited: true, amount, balance: balanceAfter }
}

/**
 * Credit all Delivered+Paid vendor orders for a parent order (e.g. after payment confirm).
 */
export async function creditEarningsForOrder(txOrDb, orderId, createdBy = null) {
  const q = queryFn(txOrDb)
  const vos = await q(
    `SELECT id FROM vendor_orders WHERE order_id = $1 AND status = 'Delivered'`,
    [orderId],
  )
  const results = []
  for (const row of vos.rows) {
    results.push(await creditVendorOrderEarning(txOrDb, row.id, createdBy))
  }
  return results
}

/**
 * Debit wallet for a payout request. Caller inserts vendor_payouts row.
 */
export async function debitWalletForPayout(txOrDb, shopId, amount, payoutId, createdBy = null) {
  const q = queryFn(txOrDb)
  const shopRes = await q(`SELECT wallet_balance FROM shops WHERE id = $1 FOR UPDATE`, [shopId])
  const balance = parseFloat(shopRes.rows[0]?.wallet_balance || 0)
  const amt = Math.round(parseFloat(amount) * 100) / 100
  if (amt <= 0) throw Object.assign(new Error('Invalid payout amount'), { statusCode: 400 })
  if (balance < amt) {
    throw Object.assign(new Error('Insufficient wallet balance'), { statusCode: 400 })
  }
  const balanceAfter = Math.round((balance - amt) * 100) / 100

  await q(`UPDATE shops SET wallet_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [
    balanceAfter,
    shopId,
  ])
  await q(
    `INSERT INTO vendor_wallet_transactions
       (shop_id, payout_id, type, amount, direction, balance_after, note, created_by)
     VALUES ($1, $2, 'payout_debit', $3, 'debit', $4, $5, $6)`,
    [shopId, payoutId, amt, balanceAfter, `Payout ${payoutId}`, createdBy],
  )
  return balanceAfter
}

/**
 * Reverse a failed/cancelled payout debit.
 */
export async function reversePayoutDebit(txOrDb, shopId, amount, payoutId, createdBy = null) {
  const q = queryFn(txOrDb)
  const shopRes = await q(`SELECT wallet_balance FROM shops WHERE id = $1 FOR UPDATE`, [shopId])
  const balance = parseFloat(shopRes.rows[0]?.wallet_balance || 0)
  const amt = Math.round(parseFloat(amount) * 100) / 100
  const balanceAfter = Math.round((balance + amt) * 100) / 100

  await q(`UPDATE shops SET wallet_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [
    balanceAfter,
    shopId,
  ])
  await q(
    `INSERT INTO vendor_wallet_transactions
       (shop_id, payout_id, type, amount, direction, balance_after, note, created_by)
     VALUES ($1, $2, 'payout_reversal', $3, 'credit', $4, $5, $6)`,
    [shopId, payoutId, amt, balanceAfter, `Payout reversal ${payoutId}`, createdBy],
  )
  return balanceAfter
}
