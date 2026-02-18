import ErrorHandler from '../middlewares/errorMiddleware.js'
import { catchAsyncErrors } from '../middlewares/catchAsyncError.js'
import database from '../database/db.js'

/**
 * Create a new address for the user
 * POST /auth/addresses
 */
export const createAddress = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user.id
  const {
    label,
    fullName,
    phone,
    streetAddress,
    apartmentSuite,
    city,
    division,
    postalCode,
    isDefault,
    isShipping,
    isBilling,
  } = req.body

  // Validate required fields
  if (!fullName || !phone || !streetAddress || !city || !division) {
    return next(
      new ErrorHandler(
        'Please provide all required fields: fullName, phone, streetAddress, city, division.',
        400,
      ),
    )
  }

  // If marking as default, unmark other addresses first
  if (isDefault === true) {
    await database.query(
      `UPDATE user_addresses SET is_default = false
       WHERE user_id = $1 AND is_default = true`,
      [userId],
    )
  }

  const result = await database.query(
    `INSERT INTO user_addresses
     (user_id, label, full_name, phone, street_address, apartment_suite,
      city, division, postal_code, is_default, is_shipping, is_billing)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      userId,
      label || 'Home',
      fullName,
      phone,
      streetAddress,
      apartmentSuite || null,
      city,
      division,
      postalCode || null,
      isDefault === true,
      isShipping !== false, // Default to true
      isBilling === true,
    ],
  )

  res.status(201).json({
    success: true,
    message: 'Address created successfully.',
    data: result.rows[0],
  })
})

/**
 * Get all addresses for the user
 * GET /auth/addresses
 */
export const getAddresses = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user.id

  const result = await database.query(
    `SELECT * FROM user_addresses
     WHERE user_id = $1
     ORDER BY is_default DESC, created_at DESC`,
    [userId],
  )

  res.status(200).json({
    success: true,
    data: result.rows,
    count: result.rows.length,
  })
})

/**
 * Get a single address by ID
 * GET /auth/addresses/:addressId
 */
export const getAddressById = catchAsyncErrors(async (req, res, next) => {
  const { addressId } = req.params
  const userId = req.user.id

  const result = await database.query(
    `SELECT * FROM user_addresses
     WHERE id = $1 AND user_id = $2`,
    [addressId, userId],
  )

  if (result.rows.length === 0) {
    return next(new ErrorHandler('Address not found.', 404))
  }

  res.status(200).json({
    success: true,
    data: result.rows[0],
  })
})

/**
 * Update an address
 * PUT /auth/addresses/:addressId
 */
export const updateAddress = catchAsyncErrors(async (req, res, next) => {
  const { addressId } = req.params
  const userId = req.user.id
  const {
    label,
    fullName,
    phone,
    streetAddress,
    apartmentSuite,
    city,
    division,
    postalCode,
    isDefault,
    isShipping,
    isBilling,
  } = req.body

  // Check if address exists and belongs to user
  const existingAddress = await database.query(
    `SELECT * FROM user_addresses WHERE id = $1 AND user_id = $2`,
    [addressId, userId],
  )

  if (existingAddress.rows.length === 0) {
    return next(new ErrorHandler('Address not found.', 404))
  }

  // If marking as default, unmark other addresses first
  if (isDefault === true) {
    await database.query(
      `UPDATE user_addresses SET is_default = false
       WHERE user_id = $1 AND id != $2 AND is_default = true`,
      [userId, addressId],
    )
  }

  // Build dynamic update query
  const updates = []
  const values = []
  let paramCount = 1

  if (label !== undefined) {
    updates.push(`label = $${paramCount++}`)
    values.push(label)
  }

  if (fullName !== undefined) {
    updates.push(`full_name = $${paramCount++}`)
    values.push(fullName)
  }

  if (phone !== undefined) {
    updates.push(`phone = $${paramCount++}`)
    values.push(phone)
  }

  if (streetAddress !== undefined) {
    updates.push(`street_address = $${paramCount++}`)
    values.push(streetAddress)
  }

  if (apartmentSuite !== undefined) {
    updates.push(`apartment_suite = $${paramCount++}`)
    values.push(apartmentSuite)
  }

  if (city !== undefined) {
    updates.push(`city = $${paramCount++}`)
    values.push(city)
  }

  if (division !== undefined) {
    updates.push(`division = $${paramCount++}`)
    values.push(division)
  }

  if (postalCode !== undefined) {
    updates.push(`postal_code = $${paramCount++}`)
    values.push(postalCode)
  }

  if (isDefault !== undefined) {
    updates.push(`is_default = $${paramCount++}`)
    values.push(isDefault)
  }

  if (isShipping !== undefined) {
    updates.push(`is_shipping = $${paramCount++}`)
    values.push(isShipping)
  }

  if (isBilling !== undefined) {
    updates.push(`is_billing = $${paramCount++}`)
    values.push(isBilling)
  }

  if (updates.length === 0) {
    return next(new ErrorHandler('No fields to update.', 400))
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`)
  values.push(addressId)
  values.push(userId)

  const result = await database.query(
    `UPDATE user_addresses
     SET ${updates.join(', ')}
     WHERE id = $${paramCount++} AND user_id = $${paramCount}
     RETURNING *`,
    values,
  )

  res.status(200).json({
    success: true,
    message: 'Address updated successfully.',
    data: result.rows[0],
  })
})

/**
 * Delete an address
 * DELETE /auth/addresses/:addressId
 */
export const deleteAddress = catchAsyncErrors(async (req, res, next) => {
  const { addressId } = req.params
  const userId = req.user.id

  // Check if address exists and belongs to user
  const existingAddress = await database.query(
    `SELECT * FROM user_addresses WHERE id = $1 AND user_id = $2`,
    [addressId, userId],
  )

  if (existingAddress.rows.length === 0) {
    return next(new ErrorHandler('Address not found.', 404))
  }

  await database.query(`DELETE FROM user_addresses WHERE id = $1 AND user_id = $2`, [
    addressId,
    userId,
  ])

  res.status(200).json({
    success: true,
    message: 'Address deleted successfully.',
  })
})

/**
 * Set an address as default
 * PUT /auth/addresses/:addressId/set-default
 */
export const setDefaultAddress = catchAsyncErrors(async (req, res, next) => {
  const { addressId } = req.params
  const userId = req.user.id

  // Check if address exists and belongs to user
  const existingAddress = await database.query(
    `SELECT * FROM user_addresses WHERE id = $1 AND user_id = $2`,
    [addressId, userId],
  )

  if (existingAddress.rows.length === 0) {
    return next(new ErrorHandler('Address not found.', 404))
  }

  // Unmark other addresses as default
  await database.query(
    `UPDATE user_addresses SET is_default = false
     WHERE user_id = $1 AND id != $2`,
    [userId, addressId],
  )

  // Mark this address as default
  const result = await database.query(
    `UPDATE user_addresses SET is_default = true
     WHERE id = $1
     RETURNING *`,
    [addressId],
  )

  res.status(200).json({
    success: true,
    message: 'Default address updated successfully.',
    data: result.rows[0],
  })
})
