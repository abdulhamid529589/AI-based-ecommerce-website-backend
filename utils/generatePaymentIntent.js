import database from '../database/db.js'
import Stripe from 'stripe'

// Lazy load Stripe - don't throw at import time
let stripe = null

const initializeStripe = () => {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = Stripe(process.env.STRIPE_SECRET_KEY)
  }
  return stripe
}

export async function generatePaymentIntent(orderId, totalPrice) {
  try {
    const stripeInstance = initializeStripe()

    if (!stripeInstance) {
      console.warn('Stripe is not configured - payment processing disabled')
      return { success: false, message: 'Payment processing is not configured on this server' }
    }

    const paymentIntent = await stripeInstance.paymentIntents.create({
      amount: totalPrice * 100,
      currency: 'bdt', // Bangladesh Taka
    })

    await database.query(
      'INSERT INTO payments (order_id, payment_type, payment_status, payment_intent_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [orderId, 'Online', 'Pending', paymentIntent.client_secret],
    )

    return { success: true, clientSecret: paymentIntent.client_secret }
  } catch (error) {
    console.error('Payment Error:', error.message || error)
    return { success: false, message: 'Payment Failed.' }
  }
}
