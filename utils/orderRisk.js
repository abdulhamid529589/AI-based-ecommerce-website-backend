/**
 * Lightweight order risk scoring (Phase 2/3 lite).
 */

import database from '../database/db.js'

export async function scoreOrderRisk({ userId, totalPrice, paymentMethod, ip, itemCount }) {
  let score = 0
  const reasons = []

  const recent = await database.query(
    `SELECT COUNT(*)::INT AS c FROM orders
     WHERE buyer_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
    [userId],
  )
  if ((recent.rows[0]?.c || 0) >= 3) {
    score += 35
    reasons.push('high_order_velocity_1h')
  }

  const fails = await database.query(
    `SELECT COUNT(*)::INT AS c FROM payments p
     JOIN orders o ON o.id = p.order_id
     WHERE o.buyer_id = $1 AND p.payment_status = 'Failed'
       AND p.order_id IN (SELECT id FROM orders WHERE buyer_id = $1 AND created_at > NOW() - INTERVAL '7 days')`,
    [userId],
  )
  if ((fails.rows[0]?.c || 0) >= 2) {
    score += 25
    reasons.push('recent_failed_payments')
  }

  if (totalPrice >= 25000) {
    score += 20
    reasons.push('high_order_value')
  } else if (totalPrice >= 10000) {
    score += 10
    reasons.push('elevated_order_value')
  }

  if (itemCount >= 15) {
    score += 15
    reasons.push('large_item_count')
  }

  const method = String(paymentMethod || '').toUpperCase()
  if (method === 'COD' && totalPrice >= 5000) {
    score += 15
    reasons.push('high_value_cod')
  }

  if (ip) {
    const sameIp = await database.query(
      `SELECT COUNT(DISTINCT buyer_id)::INT AS c FROM audit_logs
       WHERE ip_address = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
      [String(ip).slice(0, 64)],
    ).catch(() => ({ rows: [{ c: 0 }] }))
    if ((sameIp.rows[0]?.c || 0) >= 5) {
      score += 20
      reasons.push('shared_ip_activity')
    }
  }

  let level = 'low'
  if (score >= 70) level = 'critical'
  else if (score >= 45) level = 'high'
  else if (score >= 25) level = 'medium'

  return { score, level, reasons }
}

export async function persistOrderRisk(orderId, risk) {
  await database.query(
    `INSERT INTO order_risk_flags (order_id, score, level, reasons)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (order_id) DO UPDATE SET
       score = EXCLUDED.score,
       level = EXCLUDED.level,
       reasons = EXCLUDED.reasons`,
    [orderId, risk.score, risk.level, JSON.stringify(risk.reasons || [])],
  )
}
