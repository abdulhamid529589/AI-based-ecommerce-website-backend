import ErrorHandler from '../middlewares/errorMiddleware.js'
import { catchAsyncErrors } from '../middlewares/catchAsyncError.js'
import database from '../database/db.js'
import axios from 'axios'
import crypto from 'crypto'
import { withTransaction } from '../utils/transactionHelper.js'
import { commitReservationsForOrder } from '../utils/inventoryReservation.js'
import { creditEarningsForOrder } from '../utils/vendorWallet.js'
import { earnPointsForPaidOrder } from '../utils/loyalty.js'

/**
 * Load order owned by the authenticated buyer (Admin may access any).
 * Always use DB total_price — never trust client amount.
 */
async function loadOwnedOrder(req, orderId) {
  if (!orderId) {
    throw new ErrorHandler('Order ID is required', 400)
  }

  const result = await database.query(
    `SELECT o.id, o.buyer_id, o.total_price, o.order_status, o.paid_at
     FROM orders o WHERE o.id = $1`,
    [orderId],
  )

  if (!result.rows[0]) {
    throw new ErrorHandler('Order not found', 404)
  }

  const order = result.rows[0]
  if (req.user.role !== 'Admin' && order.buyer_id !== req.user.id) {
    throw new ErrorHandler('Not authorized to pay for this order', 403)
  }

  return order
}

async function upsertPaymentIntent(orderId, paymentType, paymentIntentId) {
  // Schema: payment_type Online|COD, payment_status Paid|Pending|Failed, unique order_id
  await database.query(
    `INSERT INTO payments (order_id, payment_type, payment_status, payment_intent_id)
     VALUES ($1, $2, 'Pending', $3)
     ON CONFLICT (order_id) DO UPDATE SET
       payment_type = EXCLUDED.payment_type,
       payment_status = 'Pending',
       payment_intent_id = COALESCE(EXCLUDED.payment_intent_id, payments.payment_intent_id)`,
    [orderId, paymentType, paymentIntentId],
  )
}

async function markPaymentPaid(orderId, paymentIntentId = null) {
  await withTransaction(async (tx) => {
    // Idempotent: only transition → Paid once, then credit shop sales + commit holds
    const paid = await tx.query(
      `UPDATE payments SET
         payment_status = 'Paid',
         payment_intent_id = COALESCE($2, payment_intent_id)
       WHERE order_id = $1 AND payment_status IS DISTINCT FROM 'Paid'
       RETURNING order_id`,
      [orderId, paymentIntentId],
    )

    await tx.query(
      `UPDATE orders SET paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP) WHERE id = $1`,
      [orderId],
    )

    await commitReservationsForOrder(tx, orderId)

    if (paid.rows[0]) {
      await tx.query(
        `UPDATE shops s
         SET total_sales = total_sales + vo.subtotal,
             updated_at = CURRENT_TIMESTAMP
         FROM vendor_orders vo
         WHERE vo.order_id = $1 AND vo.shop_id = s.id`,
        [orderId],
      )
      await creditEarningsForOrder(tx, orderId, null)

      const orderRow = await tx.query(
        `SELECT buyer_id, total_price FROM orders WHERE id = $1`,
        [orderId],
      )
      if (orderRow.rows[0]) {
        await earnPointsForPaidOrder(tx, {
          userId: orderRow.rows[0].buyer_id,
          orderId,
          totalPrice: orderRow.rows[0].total_price,
        })
      }
    }
  })
}

async function markPaymentFailed(orderId) {
  await database.query(`UPDATE payments SET payment_status = 'Failed' WHERE order_id = $1`, [
    orderId,
  ])
}

function timingSafeEqualHex(a, b) {
  if (!a || !b) return false
  const bufA = Buffer.from(String(a))
  const bufB = Buffer.from(String(b))
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

/** Shared secret HMAC for gateway callbacks we control / simulate */
function expectedCallbackSignature(orderId, status, amount) {
  const secret = process.env.PAYMENT_CALLBACK_SECRET
  if (!secret) {
    throw new Error('PAYMENT_CALLBACK_SECRET is not configured')
  }
  const payload = `${orderId}|${status}|${amount}|${secret}`
  return crypto.createHash('sha256').update(payload).digest('hex')
}

function verifyCallbackSignature({ orderId, status, amount, signature }) {
  if (!signature) return false
  try {
    const expected = expectedCallbackSignature(orderId, status, amount)
    return timingSafeEqualHex(expected, signature)
  } catch {
    return false
  }
}

// ============ bKash Integration ============
export const initiateBkashPayment = catchAsyncErrors(async (req, res, next) => {
  if (!process.env.BKASH_BASE_URL || !process.env.BKASH_APP_KEY) {
    return next(
      new ErrorHandler(
        'bKash is not configured. Set BKASH_BASE_URL and BKASH_APP_KEY/SECRET.',
        503,
      ),
    )
  }

  const { orderId, customerEmail, customerPhone } = req.body

  if (!orderId || !customerEmail || !customerPhone) {
    return next(new ErrorHandler('Please provide orderId, customerEmail, and customerPhone', 400))
  }

  const order = await loadOwnedOrder(req, orderId)
  const amount = parseFloat(order.total_price)

  try {
    const tokenResponse = await axios.post(
      `${process.env.BKASH_BASE_URL}/tokenized/checkout/token/request`,
      {
        app_key: process.env.BKASH_APP_KEY,
        app_secret: process.env.BKASH_APP_SECRET,
      },
      { headers: { 'Content-Type': 'application/json' } },
    )

    const accessToken = tokenResponse.data.id_token

    const paymentResponse = await axios.post(
      `${process.env.BKASH_BASE_URL}/tokenized/checkout/create`,
      {
        mode: '0011',
        payerReference: customerPhone,
        callbackURL: `${process.env.BACKEND_URL}/api/v1/payment/bkash/callback`,
        amount: amount.toString(),
        currency: 'BDT',
        intent: 'sale',
        merchantInvoiceNumber: orderId,
      },
      {
        headers: {
          Authorization: accessToken,
          'X-APP-Key': process.env.BKASH_APP_KEY,
          'Content-Type': 'application/json',
        },
      },
    )

    await upsertPaymentIntent(orderId, 'Online', paymentResponse.data.paymentID)

    res.status(200).json({
      success: true,
      paymentURL: paymentResponse.data.bkashURL,
      paymentID: paymentResponse.data.paymentID,
      amount,
    })
  } catch (error) {
    console.error('bKash Payment Error:', error?.response?.data || error.message)
    return next(new ErrorHandler('Failed to initiate bKash payment', 500))
  }
})

export const bkashPaymentCallback = catchAsyncErrors(async (req, res) => {
  const { paymentID, status } = req.query

  try {
    if (!paymentID) {
      return res.redirect(`${process.env.FRONTEND_URL}/payment/failed`)
    }

    // Resolve order from our payment record — never trust client order id alone
    const paymentRow = await database.query(
      `SELECT order_id FROM payments WHERE payment_intent_id = $1`,
      [paymentID],
    )
    if (!paymentRow.rows[0]) {
      return res.redirect(`${process.env.FRONTEND_URL}/payment/failed`)
    }
    const orderId = paymentRow.rows[0].order_id

    if (status && String(status).toLowerCase() === 'failure') {
      await markPaymentFailed(orderId)
      return res.redirect(`${process.env.FRONTEND_URL}/payment/failed?paymentID=${paymentID}`)
    }

    const tokenResponse = await axios.post(
      `${process.env.BKASH_BASE_URL}/tokenized/checkout/token/request`,
      {
        app_key: process.env.BKASH_APP_KEY,
        app_secret: process.env.BKASH_APP_SECRET,
      },
    )

    const accessToken = tokenResponse.data.id_token

    // 🔒 Execute with bKash — cryptographic confirmation from gateway
    const executeResponse = await axios.post(
      `${process.env.BKASH_BASE_URL}/tokenized/checkout/execute`,
      { paymentID },
      {
        headers: {
          Authorization: accessToken,
          'X-APP-Key': process.env.BKASH_APP_KEY,
        },
      },
    )

    if (executeResponse.data.statusCode === '0000') {
      // Optional amount sanity check against our order
      const order = await database.query(`SELECT total_price FROM orders WHERE id = $1`, [orderId])
      const gatewayAmount = parseFloat(executeResponse.data.amount)
      const dbAmount = parseFloat(order.rows[0]?.total_price)
      if (!isNaN(gatewayAmount) && !isNaN(dbAmount) && Math.abs(gatewayAmount - dbAmount) > 1) {
        console.error('bKash amount mismatch', { gatewayAmount, dbAmount, orderId })
        await markPaymentFailed(orderId)
        return res.redirect(`${process.env.FRONTEND_URL}/payment/failed?paymentID=${paymentID}`)
      }

      await markPaymentPaid(orderId, paymentID)
      return res.redirect(`${process.env.FRONTEND_URL}/payment/success?paymentID=${paymentID}`)
    }

    await markPaymentFailed(orderId)
    return res.redirect(`${process.env.FRONTEND_URL}/payment/failed?paymentID=${paymentID}`)
  } catch (error) {
    console.error('bKash Callback Error:', error?.response?.data || error.message)
    return res.redirect(`${process.env.FRONTEND_URL}/payment/failed`)
  }
})

// ============ Nagad Integration ============
export const initiateNagadPayment = catchAsyncErrors(async (req, res, next) => {
  if (process.env.ENABLE_NAGAD_PAYMENTS !== 'true' || !process.env.NAGAD_BASE_URL) {
    return next(
      new ErrorHandler(
        'Nagad payments are not enabled. Set ENABLE_NAGAD_PAYMENTS=true and NAGAD_BASE_URL.',
        503,
      ),
    )
  }

  const { orderId, customerEmail, customerPhone } = req.body

  if (!orderId || !customerEmail || !customerPhone) {
    return next(new ErrorHandler('Please provide orderId, customerEmail, and customerPhone', 400))
  }

  const order = await loadOwnedOrder(req, orderId)
  const amount = parseFloat(order.total_price)

  try {
    const merchantId = process.env.NAGAD_MERCHANT_ID
    const callbackURL = `${process.env.BACKEND_URL}/api/v1/payment/nagad/callback`
    const payload = `${merchantId}${orderId}${amount}${callbackURL}`
    const signature = crypto.createHash('sha256').update(payload).digest('hex')

    await upsertPaymentIntent(orderId, 'Online', orderId)

    res.status(200).json({
      success: true,
      amount,
      paymentData: {
        merchantId,
        orderId,
        amount,
        clientIp: req.ip,
        orderDateTime: new Date().toISOString(),
        callbackURL,
        signature,
        sensitiveData: Buffer.from(
          JSON.stringify({ phoneNumber: customerPhone, email: customerEmail }),
        ).toString('base64'),
      },
      paymentURL: `${process.env.NAGAD_BASE_URL}/checkout`,
    })
  } catch (error) {
    console.error('Nagad Payment Error:', error.message)
    return next(new ErrorHandler('Failed to initiate Nagad payment', 500))
  }
})

export const nagadPaymentCallback = catchAsyncErrors(async (req, res, next) => {
  const { orderId, status, tranId, signature } = req.body

  if (!orderId || !status) {
    return next(new ErrorHandler('Invalid callback payload', 400))
  }

  const order = await database.query(`SELECT id, total_price FROM orders WHERE id = $1`, [orderId])
  if (!order.rows[0]) {
    return next(new ErrorHandler('Order not found', 404))
  }

  const amount = parseFloat(order.rows[0].total_price)

  // 🔒 Reject unsigned / forged Success callbacks
  if (
    !verifyCallbackSignature({
      orderId,
      status,
      amount,
      signature,
    })
  ) {
    console.warn('⚠️ Nagad callback signature invalid', { orderId })
    return next(new ErrorHandler('Invalid payment callback signature', 403))
  }

  try {
    if (status === 'Success') {
      await markPaymentPaid(orderId, tranId || orderId)
      return res.json({ success: true, message: 'Payment successful' })
    }

    await markPaymentFailed(orderId)
    return res.json({ success: false, message: 'Payment failed' })
  } catch (error) {
    console.error('Nagad Callback Error:', error.message)
    return next(new ErrorHandler('Callback processing failed', 500))
  }
})

// ============ Rocket Integration ============
export const initiateRocketPayment = catchAsyncErrors(async (req, res, next) => {
  if (process.env.ENABLE_ROCKET_PAYMENTS !== 'true' || !process.env.ROCKET_BASE_URL) {
    return next(
      new ErrorHandler(
        'Rocket payments are not enabled. Set ENABLE_ROCKET_PAYMENTS=true and ROCKET_BASE_URL.',
        503,
      ),
    )
  }

  const { orderId, customerEmail, customerPhone } = req.body

  if (!orderId || !customerEmail || !customerPhone) {
    return next(new ErrorHandler('Please provide orderId, customerEmail, and customerPhone', 400))
  }

  const order = await loadOwnedOrder(req, orderId)
  const amount = parseFloat(order.total_price)

  try {
    const signaturePayload = `${process.env.ROCKET_MERCHANT_ID}${orderId}${amount}${process.env.ROCKET_MERCHANT_PASSWORD}`
    const signature = crypto.createHash('md5').update(signaturePayload).digest('hex')

    await upsertPaymentIntent(orderId, 'Online', orderId)

    res.status(200).json({
      success: true,
      amount,
      paymentData: {
        merchant_id: process.env.ROCKET_MERCHANT_ID,
        order_id: orderId,
        amount,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        currency: 'BDT',
        callback_url: `${process.env.BACKEND_URL}/api/v1/payment/rocket/callback`,
        success_url: `${process.env.FRONTEND_URL}/payment/success`,
        fail_url: `${process.env.FRONTEND_URL}/payment/failed`,
        signature,
      },
      paymentURL: `${process.env.ROCKET_BASE_URL}/api/v1/payment`,
    })
  } catch (error) {
    console.error('Rocket Payment Error:', error.message)
    return next(new ErrorHandler('Failed to initiate Rocket payment', 500))
  }
})

export const rocketPaymentCallback = catchAsyncErrors(async (req, res, next) => {
  const { order_id, status, transactionId, signature } = req.body

  if (!order_id || !status) {
    return next(new ErrorHandler('Invalid callback payload', 400))
  }

  const order = await database.query(`SELECT id, total_price FROM orders WHERE id = $1`, [order_id])
  if (!order.rows[0]) {
    return next(new ErrorHandler('Order not found', 404))
  }

  const amount = parseFloat(order.rows[0].total_price)

  if (
    !verifyCallbackSignature({
      orderId: order_id,
      status,
      amount,
      signature,
    })
  ) {
    console.warn('⚠️ Rocket callback signature invalid', { order_id })
    return next(new ErrorHandler('Invalid payment callback signature', 403))
  }

  try {
    if (status === 'Success') {
      await markPaymentPaid(order_id, transactionId || order_id)
      return res.json({ success: true, message: 'Payment successful' })
    }

    await markPaymentFailed(order_id)
    return res.json({ success: false, message: 'Payment failed' })
  } catch (error) {
    console.error('Rocket Callback Error:', error.message)
    return next(new ErrorHandler('Callback processing failed', 500))
  }
})

// ============ Cash on Delivery (COD) ============
export const initiateCODPayment = catchAsyncErrors(async (req, res, next) => {
  const { orderId } = req.body

  if (!orderId) {
    return next(new ErrorHandler('Please provide order ID', 400))
  }

  const order = await loadOwnedOrder(req, orderId)
  const amount = parseFloat(order.total_price)

  await upsertPaymentIntent(orderId, 'COD', orderId)

  res.status(201).json({
    success: true,
    message: 'Cash on Delivery initiated successfully',
    paymentMethod: 'COD',
    amount,
  })
})

// Get payment status — owner or Admin only
export const getPaymentStatus = catchAsyncErrors(async (req, res, next) => {
  const { orderId } = req.params

  // Accept either order UUID or gateway payment_intent_id (bKash paymentID redirect)
  const result = await database.query(
    `SELECT p.*, o.buyer_id, o.total_price
     FROM payments p
     JOIN orders o ON o.id = p.order_id
     WHERE p.order_id::text = $1 OR p.payment_intent_id = $1
     LIMIT 1`,
    [orderId],
  )

  if (result.rows.length === 0) {
    return next(new ErrorHandler('Payment not found', 404))
  }

  const row = result.rows[0]
  if (req.user.role !== 'Admin' && row.buyer_id !== req.user.id) {
    return next(new ErrorHandler('Not authorized to view this payment', 403))
  }

  const { buyer_id, ...payment } = row
  res.status(200).json({
    success: true,
    payment: {
      ...payment,
      amount: payment.amount ?? row.total_price,
    },
  })
})

// Exported for tests / gateway simulators
export { expectedCallbackSignature, verifyCallbackSignature, loadOwnedOrder }
