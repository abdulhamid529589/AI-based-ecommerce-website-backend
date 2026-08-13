/**
 * Inventory reservations — hold stock at checkout with TTL for unpaid online orders.
 * Stock is decremented immediately (hard hold); expiry restores stock if still unpaid.
 */

import { withTransaction } from './transactionHelper.js'

/** Online unpaid hold window (minutes) */
export const ONLINE_RESERVATION_MINUTES = Number(process.env.STOCK_RESERVE_MINUTES || 30)
/** COD hold window (days) */
export const COD_RESERVATION_DAYS = Number(process.env.COD_RESERVE_DAYS || 7)

export function reservationExpiry(paymentMethod) {
  const isCod = String(paymentMethod || '').toUpperCase() === 'COD'
  if (isCod) {
    return new Date(Date.now() + COD_RESERVATION_DAYS * 24 * 60 * 60 * 1000)
  }
  return new Date(Date.now() + ONLINE_RESERVATION_MINUTES * 60 * 1000)
}

/**
 * Insert active reservation rows (stock already decremented by caller).
 */
export async function createReservations(tx, orderId, lines, paymentMethod) {
  const expiresAt = reservationExpiry(paymentMethod)
  for (const line of lines) {
    await tx.query(
      `INSERT INTO inventory_reservations (order_id, product_id, quantity, status, expires_at)
       VALUES ($1, $2, $3, 'active', $4)
       ON CONFLICT (order_id, product_id) DO UPDATE SET
         quantity = EXCLUDED.quantity,
         status = 'active',
         expires_at = EXCLUDED.expires_at`,
      [orderId, line.product_id, line.quantity, expiresAt],
    )
  }
  return expiresAt
}

export async function commitReservationsForOrder(txOrDb, orderId) {
  await txOrDb.query(
    `UPDATE inventory_reservations
     SET status = 'committed'
     WHERE order_id = $1 AND status = 'active'`,
    [orderId],
  )
}

export async function releaseReservationsForOrder(txOrDb, orderId, toStatus = 'released') {
  const active = await txOrDb.query(
    `SELECT id, product_id, quantity FROM inventory_reservations
     WHERE order_id = $1 AND status = 'active'`,
    [orderId],
  )
  for (const row of active.rows) {
    await txOrDb.query(`UPDATE products SET stock = stock + $1 WHERE id = $2`, [
      row.quantity,
      row.product_id,
    ])
    await txOrDb.query(`UPDATE inventory_reservations SET status = $1 WHERE id = $2`, [
      toStatus,
      row.id,
    ])
  }
  return active.rows.length
}

/**
 * Expire stale unpaid reservations: restore stock, mark order Cancelled if still unpaid.
 */
export async function expireStaleReservations() {
  return withTransaction(async (tx) => {
    const stale = await tx.query(
      `SELECT DISTINCT r.order_id
       FROM inventory_reservations r
       LEFT JOIN payments p ON p.order_id = r.order_id
       WHERE r.status = 'active'
         AND r.expires_at < NOW()
         AND (p.payment_status IS NULL OR p.payment_status IS DISTINCT FROM 'Paid')`,
    )

    let expiredOrders = 0
    for (const { order_id: orderId } of stale.rows) {
      const released = await releaseReservationsForOrder(tx, orderId, 'expired')
      if (released === 0) continue

      await tx.query(
        `UPDATE orders SET order_status = 'Cancelled'
         WHERE id = $1 AND order_status = 'Processing'`,
        [orderId],
      )

      const cancelledVos = await tx.query(
        `UPDATE vendor_orders SET status = 'Cancelled', updated_at = CURRENT_TIMESTAMP
         WHERE order_id = $1 AND status IN ('Processing', 'Shipped')
         RETURNING shop_id`,
        [orderId],
      )

      for (const vo of cancelledVos.rows) {
        await tx.query(
          `UPDATE shops SET
             total_orders = GREATEST(total_orders - 1, 0),
             updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [vo.shop_id],
        )
      }
      expiredOrders += 1
    }
    return { expiredOrders }
  })
}

/** Fire-and-forget safe wrapper for request paths */
export async function expireStaleReservationsSafe() {
  try {
    return await expireStaleReservations()
  } catch (err) {
    console.warn('Reservation expiry skipped:', err.message)
    return { expiredOrders: 0, error: err.message }
  }
}

export function startReservationCleanupJob(intervalMs = 5 * 60 * 1000) {
  if (process.env.NODE_ENV === 'test') return null
  const tick = () => expireStaleReservationsSafe()
  tick()
  return setInterval(tick, intervalMs)
}
