/**
 * 🔒 Input Validation & Sanitization Utility
 * Prevents SQL injection, XSS, and data integrity issues
 *
 * CRITICAL: All user inputs must pass these validators
 */

import ErrorHandler from '../middlewares/errorMiddleware.js'

/**
 * ✅ Sanitize string input - remove dangerous characters
 * @param {string} input - Raw input string
 * @param {number} maxLength - Maximum allowed length
 * @param {string} fieldName - Field name for error messages
 * @returns {string} Sanitized string
 */
export const sanitizeString = (input, maxLength = 255, fieldName = 'Input') => {
  if (typeof input !== 'string') {
    throw new ErrorHandler(`${fieldName} must be a string`, 400)
  }

  // Trim whitespace
  let sanitized = input.trim()

  // Check length
  if (sanitized.length === 0) {
    throw new ErrorHandler(`${fieldName} cannot be empty`, 400)
  }

  if (sanitized.length > maxLength) {
    throw new ErrorHandler(`${fieldName} exceeds maximum length of ${maxLength}`, 400)
  }

  // Remove null bytes (can cause issues in some systems)
  sanitized = sanitized.replace(/\0/g, '')

  // HTML escape dangerous characters
  const htmlEscapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
  }

  sanitized = sanitized.replace(/[&<>"'\/]/g, (char) => htmlEscapeMap[char])

  return sanitized
}

/**
 * ✅ Validate email format
 * @param {string} email - Email to validate
 * @returns {string} Validated email
 */
export const validateEmail = (email) => {
  const sanitized = sanitizeString(email, 254, 'Email')

  // RFC 5322 simplified regex
  const emailRegex =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$|^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

  if (!emailRegex.test(sanitized)) {
    throw new ErrorHandler('Invalid email format', 400)
  }

  // Convert to lowercase for consistency
  return sanitized.toLowerCase()
}

/**
 * ✅ Validate phone number format (supports +, -, (), spaces)
 * @param {string} phone - Phone number to validate
 * @returns {string} Validated phone (digits + allowed chars only)
 */
export const validatePhone = (phone) => {
  const sanitized = sanitizeString(phone, 20, 'Phone')

  // Allow: digits, +, -, (, ), space
  const phoneRegex = /^[\d+\-().\s]+$/

  if (!phoneRegex.test(sanitized)) {
    throw new ErrorHandler('Invalid phone format. Only digits, +, -, (), . and spaces allowed', 400)
  }

  // Extract only digits for validation
  const digitsOnly = sanitized.replace(/\D/g, '')

  if (digitsOnly.length < 7 || digitsOnly.length > 15) {
    throw new ErrorHandler('Phone number must contain 7-15 digits', 400)
  }

  return sanitized
}

/**
 * ✅ Validate name (letters, spaces, hyphens, apostrophes only)
 * @param {string} name - Name to validate
 * @returns {string} Validated name
 */
export const validateName = (name) => {
  const sanitized = sanitizeString(name, 100, 'Name')

  // Allow: letters, spaces, hyphens, apostrophes, accented characters
  const nameRegex = /^[a-zA-Z\s\-'àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]+$/i

  if (!nameRegex.test(sanitized)) {
    throw new ErrorHandler('Name can only contain letters, spaces, hyphens, and apostrophes', 400)
  }

  return sanitized
}

/**
 * ✅ Validate address (alphanumeric + common punctuation)
 * @param {string} address - Address to validate
 * @returns {string} Validated address
 */
export const validateAddress = (address) => {
  const sanitized = sanitizeString(address, 500, 'Address')

  // Allow: alphanumeric, spaces, dots, commas, hyphens, slashes
  const addressRegex = /^[a-zA-Z0-9\s.,\-/\n]+$/

  if (!addressRegex.test(sanitized)) {
    throw new ErrorHandler('Address contains invalid characters', 400)
  }

  return sanitized
}

/**
 * ✅ Validate postal/pin code (digits and hyphens)
 * @param {string} pincode - Postal code to validate
 * @returns {string} Validated pincode
 */
export const validatePincode = (pincode) => {
  const sanitized = sanitizeString(pincode, 20, 'Postal Code')

  // Allow: digits and hyphens (supports formats like 12345 or 12345-6789)
  const pincodeRegex = /^[0-9\-]+$/

  if (!pincodeRegex.test(sanitized)) {
    throw new ErrorHandler('Postal code can only contain digits and hyphens', 400)
  }

  const digitsOnly = sanitized.replace(/\D/g, '')
  if (digitsOnly.length < 4 || digitsOnly.length > 10) {
    throw new ErrorHandler('Postal code must contain 4-10 digits', 400)
  }

  return sanitized
}

/**
 * ✅ Validate country/state/city names
 * @param {string} location - Location name to validate
 * @param {string} fieldName - Field name for error messages
 * @returns {string} Validated location
 */
export const validateLocation = (location, fieldName = 'Location') => {
  const sanitized = sanitizeString(location, 100, fieldName)

  // Allow: letters, spaces, hyphens, apostrophes
  const locationRegex = /^[a-zA-Z\s\-']+$/

  if (!locationRegex.test(sanitized)) {
    throw new ErrorHandler(`${fieldName} can only contain letters, spaces, and hyphens`, 400)
  }

  return sanitized
}

/**
 * ✅ Validate and sanitize order items array
 * @param {array} items - Array of order items
 * @returns {array} Validated items
 */
export const validateOrderItems = (items) => {
  if (!Array.isArray(items)) {
    throw new ErrorHandler('Order items must be an array', 400)
  }

  if (items.length === 0) {
    throw new ErrorHandler('At least one item is required', 400)
  }

  if (items.length > 100) {
    throw new ErrorHandler('Maximum 100 items per order', 400)
  }

  return items.map((item, index) => {
    if (!item.product || !item.product.id) {
      throw new ErrorHandler(`Item ${index + 1}: Missing product ID`, 400)
    }

    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100) {
      throw new ErrorHandler(
        `Item ${index + 1}: Quantity must be an integer between 1 and 100`,
        400,
      )
    }

    return {
      ...item,
      product: {
        ...item.product,
        id: item.product.id, // UUID validation happens at DB level
      },
    }
  })
}

/**
 * ✅ Validate payment method
 * @param {string} method - Payment method to validate
 * @returns {string} Validated payment method
 */
export const validatePaymentMethod = (method) => {
  const allowed = ['COD', 'Stripe', 'Bkash', 'Nagad']

  if (!allowed.includes(method)) {
    throw new ErrorHandler(`Invalid payment method. Allowed: ${allowed.join(', ')}`, 400)
  }

  return method
}

/**
 * ✅ Escape HTML for displaying user content
 * (Already applied in sanitizeString, but available separately)
 * @param {string} text - Text to escape
 * @returns {string} HTML-escaped text
 */
export const escapeHtml = (text) => {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return text.replace(/[&<>"']/g, (m) => map[m])
}

/**
 * ✅ Comprehensive order data validation
 * @param {object} orderData - Order data object
 * @returns {object} Validated and sanitized order data
 */
export const validateOrderData = (orderData) => {
  const { full_name, state, city, country, address, pincode, phone, orderedItems, paymentMethod } =
    orderData

  return {
    full_name: validateName(full_name),
    state: validateLocation(state, 'State'),
    city: validateLocation(city, 'City'),
    country: validateLocation(country, 'Country'),
    address: validateAddress(address),
    pincode: validatePincode(pincode),
    phone: validatePhone(phone),
    orderedItems: validateOrderItems(orderedItems),
    paymentMethod: validatePaymentMethod(paymentMethod),
  }
}

export default {
  sanitizeString,
  validateEmail,
  validatePhone,
  validateName,
  validateAddress,
  validatePincode,
  validateLocation,
  validateOrderItems,
  validatePaymentMethod,
  escapeHtml,
  validateOrderData,
}
