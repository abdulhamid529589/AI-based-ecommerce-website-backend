import crypto from 'crypto'

/**
 * Order Signature Utility
 * Implements HMAC-SHA256 for order data integrity
 * Prevents manipulation of prices, quantities, and totals in transit
 */

// Use environment variable or fallback (change in production!)
const ORDER_SIGNATURE_SECRET =
  process.env.ORDER_SIGNATURE_SECRET ||
  'your-secure-order-signature-secret-key-change-in-production'

/**
 * Create HMAC signature for order data
 * @param {Object} orderData - { items: [], subtotal, shipping, tax }
 * @returns {string} Hex encoded HMAC-SHA256
 */
export const signOrderData = (orderData) => {
  // Create consistent string representation of order data
  const dataString = JSON.stringify({
    items: orderData.items.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
    })),
    subtotal: orderData.subtotal,
    shipping: orderData.shipping,
    tax: orderData.tax,
  })

  return crypto.createHmac('sha256', ORDER_SIGNATURE_SECRET).update(dataString).digest('hex')
}

/**
 * Verify HMAC signature for order data
 * @param {Object} orderData - Original order data
 * @param {string} signature - Signature to verify
 * @returns {boolean} Whether signature is valid
 * @throws {Error} If signature is invalid
 */
export const verifyOrderSignature = (orderData, signature) => {
  const expectedSignature = signOrderData(orderData)

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  } catch (error) {
    // timingSafeEqual throws if lengths don't match
    return false
  }
}

/**
 * Validate order data integrity
 * @param {Object} orderData - { items, subtotal, shipping, tax }
 * @param {string} signature - Order signature
 * @throws {Error} If data is invalid or tampered
 */
export const validateOrderIntegrity = (orderData, signature) => {
  if (!signature) {
    throw new Error('Order signature missing. Cannot verify integrity.')
  }

  if (!verifyOrderSignature(orderData, signature)) {
    throw new Error('Order data appears to have been tampered with. Please refresh and try again.')
  }

  return true
}
