/**
 * Promo resolution for marketplace carts.
 * Platform promos (shop_id NULL) apply to full subtotal.
 * Vendor promos apply only to that shop's line subtotal.
 */

import database from '../database/db.js'

function computeDiscount(promo, eligibleSubtotal) {
  const minOrder = parseFloat(promo.min_order_value || 0)
  if (eligibleSubtotal < minOrder) {
    return {
      ok: false,
      message: `Minimum order for this code is ৳${minOrder}`,
    }
  }

  let amount = 0
  const type = promo.type
  const value = parseFloat(promo.value)

  // Prefer type/value; fall back to legacy discount_* columns
  if (type === 'percentage' || (promo.discount_percent != null && !type)) {
    const pct = type === 'percentage' ? value : parseFloat(promo.discount_percent)
    amount = (eligibleSubtotal * pct) / 100
  } else if (type === 'fixed' || promo.discount_amount != null) {
    amount = type === 'fixed' ? value : parseFloat(promo.discount_amount)
  }

  amount = Math.min(amount, eligibleSubtotal)
  amount = Math.round(amount * 100) / 100
  if (amount <= 0) {
    return { ok: false, message: 'Promo produces no discount for this cart' }
  }
  return { ok: true, amount }
}

export async function loadActivePromoByCode(code) {
  if (!code || String(code).trim().length < 2) return null
  const result = await database.query(
    `SELECT * FROM promotions
     WHERE UPPER(code) = UPPER($1)
       AND is_active = true
       AND (expiry_date IS NULL OR expiry_date > NOW())
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (starts_at IS NULL OR starts_at <= NOW())`,
    [String(code).trim()],
  )
  return result.rows[0] || null
}

/**
 * @param {object} promo
 * @param {Array<{ shop_id?: string|null, price: number, quantity: number }>} lineItems
 */
export function eligibleSubtotalForPromo(promo, lineItems) {
  if (!promo.shop_id) {
    return lineItems.reduce((s, l) => s + l.price * l.quantity, 0)
  }
  return lineItems
    .filter((l) => l.shop_id === promo.shop_id)
    .reduce((s, l) => s + l.price * l.quantity, 0)
}

/**
 * Validate + compute discount for a cart.
 */
export async function resolvePromoForCart(code, lineItems, userId = null) {
  const promo = await loadActivePromoByCode(code)
  if (!promo) {
    return { ok: false, message: 'Invalid or expired promo code' }
  }

  if (promo.max_uses != null && parseInt(promo.used_count || 0) >= parseInt(promo.max_uses)) {
    return { ok: false, message: 'This promo code has reached its usage limit' }
  }

  const eligible = eligibleSubtotalForPromo(promo, lineItems)
  if (eligible <= 0) {
    return {
      ok: false,
      message: promo.shop_id
        ? 'This seller promo does not apply to items in your cart'
        : 'Cart is empty for this promo',
    }
  }

  const computed = computeDiscount(promo, eligible)
  if (!computed.ok) return computed

  return {
    ok: true,
    promo,
    discount: computed.amount,
    eligibleSubtotal: eligible,
    shop_id: promo.shop_id || null,
    code: promo.code,
  }
}

export async function recordPromoUsage(txOrDb, { userId, promoId, orderId }) {
  await txOrDb.query(
    `INSERT INTO promo_usage (user_id, promo_id, order_id) VALUES ($1, $2, $3)`,
    [userId, promoId, orderId],
  )
  await txOrDb.query(
    `UPDATE promotions SET used_count = COALESCE(used_count, 0) + 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [promoId],
  )
}
