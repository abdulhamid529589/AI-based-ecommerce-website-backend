import { catchAsyncErrors } from '../middlewares/catchAsyncError.js'
import ErrorHandler from '../middlewares/errorMiddleware.js'
import database from '../database/db.js'
import { quoteShipping } from '../utils/shippingQuote.js'

const sanitize = (str) => {
  if (typeof str !== 'string') return str
  return str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').trim()
}

export const getShippingQuote = catchAsyncErrors(async (req, res, next) => {
  const city = req.query.city || req.body?.city
  const subtotal = req.query.subtotal || req.body?.subtotal || 0
  const carrier = req.query.carrier || req.body?.carrier || null

  if (!city) return next(new ErrorHandler('city is required', 400))

  const quote = await quoteShipping({ city, subtotal, carrier })
  res.status(200).json({ success: true, quote })
})

export const listZones = catchAsyncErrors(async (req, res) => {
  const zones = await database.query(
    `SELECT z.*,
       COALESCE(
         json_agg(
           json_build_object(
             'id', r.id, 'carrier', r.carrier, 'name', r.name,
             'base_rate', r.base_rate, 'per_kg_rate', r.per_kg_rate,
             'free_above', r.free_above, 'is_active', r.is_active
           )
         ) FILTER (WHERE r.id IS NOT NULL), '[]'
       ) AS rates
     FROM shipping_zones z
     LEFT JOIN shipping_rates r ON r.zone_id = z.id
     GROUP BY z.id
     ORDER BY z.name ASC`,
  )
  res.status(200).json({ success: true, zones: zones.rows })
})

export const createZone = catchAsyncErrors(async (req, res, next) => {
  const { name, cities, estimated_days_min, estimated_days_max, is_active } = req.body
  if (!name || String(name).trim().length < 2) {
    return next(new ErrorHandler('Zone name is required', 400))
  }
  const cityArr = Array.isArray(cities)
    ? cities.map((c) => String(c).toLowerCase().trim()).filter(Boolean)
    : []

  const result = await database.query(
    `INSERT INTO shipping_zones (name, cities, estimated_days_min, estimated_days_max, is_active)
     VALUES ($1, $2, $3, $4, COALESCE($5, true))
     RETURNING *`,
    [
      sanitize(name),
      cityArr,
      parseInt(estimated_days_min) || 2,
      parseInt(estimated_days_max) || 5,
      typeof is_active === 'boolean' ? is_active : true,
    ],
  )
  res.status(201).json({ success: true, zone: result.rows[0] })
})

export const updateZone = catchAsyncErrors(async (req, res, next) => {
  const { name, cities, estimated_days_min, estimated_days_max, is_active } = req.body
  const existing = await database.query(`SELECT id FROM shipping_zones WHERE id = $1`, [
    req.params.zoneId,
  ])
  if (!existing.rows[0]) return next(new ErrorHandler('Zone not found', 404))

  const cityArr = Array.isArray(cities)
    ? cities.map((c) => String(c).toLowerCase().trim()).filter(Boolean)
    : null

  const result = await database.query(
    `UPDATE shipping_zones SET
       name = COALESCE($1, name),
       cities = COALESCE($2, cities),
       estimated_days_min = COALESCE($3, estimated_days_min),
       estimated_days_max = COALESCE($4, estimated_days_max),
       is_active = COALESCE($5, is_active),
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $6
     RETURNING *`,
    [
      name ? sanitize(name) : null,
      cityArr,
      estimated_days_min != null ? parseInt(estimated_days_min) : null,
      estimated_days_max != null ? parseInt(estimated_days_max) : null,
      typeof is_active === 'boolean' ? is_active : null,
      req.params.zoneId,
    ],
  )
  res.status(200).json({ success: true, zone: result.rows[0] })
})

export const createRate = catchAsyncErrors(async (req, res, next) => {
  const { zone_id, carrier, name, base_rate, per_kg_rate, free_above, is_active } = req.body
  if (!zone_id || !name || base_rate == null) {
    return next(new ErrorHandler('zone_id, name, and base_rate are required', 400))
  }
  const zone = await database.query(`SELECT id FROM shipping_zones WHERE id = $1`, [zone_id])
  if (!zone.rows[0]) return next(new ErrorHandler('Zone not found', 404))

  const result = await database.query(
    `INSERT INTO shipping_rates (zone_id, carrier, name, base_rate, per_kg_rate, free_above, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, true))
     RETURNING *`,
    [
      zone_id,
      sanitize(carrier || 'standard'),
      sanitize(name),
      parseFloat(base_rate),
      parseFloat(per_kg_rate) || 0,
      free_above != null ? parseFloat(free_above) : null,
      typeof is_active === 'boolean' ? is_active : true,
    ],
  )
  res.status(201).json({ success: true, rate: result.rows[0] })
})

export const updateRate = catchAsyncErrors(async (req, res, next) => {
  const { carrier, name, base_rate, per_kg_rate, free_above, is_active } = req.body
  const existing = await database.query(`SELECT * FROM shipping_rates WHERE id = $1`, [
    req.params.rateId,
  ])
  if (!existing.rows[0]) return next(new ErrorHandler('Rate not found', 404))
  const cur = existing.rows[0]

  const result = await database.query(
    `UPDATE shipping_rates SET
       carrier = $1,
       name = $2,
       base_rate = $3,
       per_kg_rate = $4,
       free_above = $5,
       is_active = $6
     WHERE id = $7
     RETURNING *`,
    [
      carrier != null ? sanitize(carrier) : cur.carrier,
      name != null ? sanitize(name) : cur.name,
      base_rate != null ? parseFloat(base_rate) : cur.base_rate,
      per_kg_rate != null ? parseFloat(per_kg_rate) : cur.per_kg_rate,
      free_above !== undefined
        ? free_above == null
          ? null
          : parseFloat(free_above)
        : cur.free_above,
      typeof is_active === 'boolean' ? is_active : cur.is_active,
      req.params.rateId,
    ],
  )

  res.status(200).json({ success: true, rate: result.rows[0] })
})

export const deleteRate = catchAsyncErrors(async (req, res, next) => {
  const result = await database.query(
    `DELETE FROM shipping_rates WHERE id = $1 RETURNING id`,
    [req.params.rateId],
  )
  if (!result.rows[0]) return next(new ErrorHandler('Rate not found', 404))
  res.status(200).json({ success: true, message: 'Rate deleted' })
})
