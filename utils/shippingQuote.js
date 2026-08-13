/**
 * Zone-based shipping quote from shipping_zones / shipping_rates.
 * Falls back to flat rate when no zones configured.
 */

import database from '../database/db.js'

const normalizeCity = (city) =>
  String(city || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')

/**
 * Find best matching active zone for a city (exact city match, else catch-all empty cities).
 */
export async function findZoneForCity(city) {
  const normalized = normalizeCity(city)
  const zones = await database.query(
    `SELECT * FROM shipping_zones WHERE is_active = true ORDER BY created_at ASC`,
  )
  if (!zones.rows.length) return null

  let match = zones.rows.find(
    (z) => Array.isArray(z.cities) && z.cities.some((c) => normalizeCity(c) === normalized),
  )
  if (!match) {
    match = zones.rows.find((z) => !z.cities || z.cities.length === 0)
  }
  return match || zones.rows[0]
}

/**
 * @returns {{ shipping_price, zone, rates, selected_rate, estimated_days_min, estimated_days_max }}
 */
export async function quoteShipping({ city, subtotal, carrier = null }) {
  const sub = Math.max(0, parseFloat(subtotal) || 0)
  const zone = await findZoneForCity(city)

  if (!zone) {
    // Legacy fallback from settings
    let shipping_price = 100
    try {
      const { getSetting } = await import('../models/settingsTable.js')
      const shippingSettings = await getSetting('shipping_settings')
      if (shippingSettings?.shipping) {
        if (
          shippingSettings.shipping.freeShippingEnabled &&
          sub >= (shippingSettings.shipping.freeShippingThreshold || Infinity)
        ) {
          shipping_price = 0
        } else {
          shipping_price = shippingSettings.shipping.standardShippingCost || 100
        }
      }
    } catch {
      /* keep default */
    }
    return {
      shipping_price,
      zone: null,
      rates: [],
      selected_rate: null,
      estimated_days_min: 2,
      estimated_days_max: 5,
      source: 'settings_fallback',
    }
  }

  const ratesRes = await database.query(
    `SELECT * FROM shipping_rates
     WHERE zone_id = $1 AND is_active = true
     ORDER BY base_rate ASC`,
    [zone.id],
  )
  let rates = ratesRes.rows
  if (carrier) {
    const filtered = rates.filter((r) => r.carrier === carrier)
    if (filtered.length) rates = filtered
  }

  if (!rates.length) {
    return {
      shipping_price: 100,
      zone,
      rates: [],
      selected_rate: null,
      estimated_days_min: zone.estimated_days_min,
      estimated_days_max: zone.estimated_days_max,
      source: 'zone_no_rates',
    }
  }

  // Pick cheapest eligible rate (after free_above), or cheapest base
  let selected = null
  let bestPrice = Infinity
  for (const rate of rates) {
    let price = parseFloat(rate.base_rate)
    if (rate.free_above != null && sub >= parseFloat(rate.free_above)) {
      price = 0
    }
    if (price < bestPrice) {
      bestPrice = price
      selected = { ...rate, computed_price: price }
    }
  }

  return {
    shipping_price: Math.round(bestPrice * 100) / 100,
    zone: {
      id: zone.id,
      name: zone.name,
      estimated_days_min: zone.estimated_days_min,
      estimated_days_max: zone.estimated_days_max,
    },
    rates: rates.map((r) => ({
      ...r,
      computed_price:
        r.free_above != null && sub >= parseFloat(r.free_above)
          ? 0
          : parseFloat(r.base_rate),
    })),
    selected_rate: selected,
    estimated_days_min: zone.estimated_days_min,
    estimated_days_max: zone.estimated_days_max,
    source: 'zones',
  }
}
