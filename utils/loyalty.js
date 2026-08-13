/**
 * Loyalty points — earn on paid orders, redeem at checkout quote.
 * 1 point per ৳100 paid; 100 points = ৳10 discount.
 */

import database from '../database/db.js'

export const POINTS_PER_100_BDT = Number(process.env.LOYALTY_POINTS_PER_100 || 1)
export const REDEEM_POINTS_PER_BDT = Number(process.env.LOYALTY_REDEEM_RATE || 10) // 10 pts = 1 BDT

function tierForLifetime(lifetime) {
  if (lifetime >= 5000) return 'platinum'
  if (lifetime >= 2000) return 'gold'
  if (lifetime >= 500) return 'silver'
  return 'bronze'
}

export async function ensureLoyaltyAccount(userId, txOrDb = database) {
  await txOrDb.query(
    `INSERT INTO loyalty_accounts (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  )
}

export async function earnPointsForPaidOrder(txOrDb, { userId, orderId, totalPrice }) {
  await ensureLoyaltyAccount(userId, txOrDb)
  const points = Math.floor(parseFloat(totalPrice) / 100) * POINTS_PER_100_BDT
  if (points <= 0) return { points: 0 }

  const existing = await txOrDb.query(
    `SELECT id FROM loyalty_transactions
     WHERE order_id = $1 AND type = 'earn' LIMIT 1`,
    [orderId],
  )
  if (existing.rows[0]) return { points: 0, already: true }

  const acc = await txOrDb.query(
    `SELECT points, lifetime_points FROM loyalty_accounts WHERE user_id = $1 FOR UPDATE`,
    [userId],
  )
  const current = acc.rows[0] || { points: 0, lifetime_points: 0 }
  const newPoints = parseInt(current.points) + points
  const lifetime = parseInt(current.lifetime_points) + points
  const tier = tierForLifetime(lifetime)

  await txOrDb.query(
    `UPDATE loyalty_accounts SET
       points = $1, lifetime_points = $2, tier = $3, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $4`,
    [newPoints, lifetime, tier, userId],
  )
  await txOrDb.query(
    `INSERT INTO loyalty_transactions (user_id, order_id, points, type, note)
     VALUES ($1, $2, $3, 'earn', $4)`,
    [userId, orderId, points, `Earned ${points} pts for order ${orderId}`],
  )
  return { points, balance: newPoints, tier }
}

export async function quoteRedeem(userId, pointsToRedeem) {
  await ensureLoyaltyAccount(userId)
  const acc = await database.query(`SELECT points FROM loyalty_accounts WHERE user_id = $1`, [
    userId,
  ])
  const balance = parseInt(acc.rows[0]?.points || 0)
  const pts = Math.max(0, Math.floor(Number(pointsToRedeem) || 0))
  if (pts > balance) {
    return { ok: false, message: 'Insufficient loyalty points', balance }
  }
  const discount = Math.floor(pts / REDEEM_POINTS_PER_BDT)
  return { ok: true, points: pts, discountBdt: discount, balance }
}

export async function redeemPoints(txOrDb, { userId, orderId, points }) {
  const quote = await quoteRedeem(userId, points)
  if (!quote.ok || quote.discountBdt <= 0) return quote

  const acc = await txOrDb.query(
    `SELECT points FROM loyalty_accounts WHERE user_id = $1 FOR UPDATE`,
    [userId],
  )
  const balance = parseInt(acc.rows[0]?.points || 0)
  if (quote.points > balance) {
    return { ok: false, message: 'Insufficient loyalty points', balance }
  }
  const newBal = balance - quote.points
  await txOrDb.query(
    `UPDATE loyalty_accounts SET points = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2`,
    [newBal, userId],
  )
  await txOrDb.query(
    `INSERT INTO loyalty_transactions (user_id, order_id, points, type, note)
     VALUES ($1, $2, $3, 'redeem', $4)`,
    [userId, orderId, -quote.points, `Redeemed ${quote.points} pts (−৳${quote.discountBdt})`],
  )
  return { ok: true, ...quote, balance: newBal }
}
