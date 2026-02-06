import ErrorHandler from '../middlewares/errorMiddleware.js'
import { catchAsyncErrors } from '../middlewares/catchAsyncError.js'
import database from '../database/db.js'
import axios from 'axios'
import crypto from 'crypto'

// ============ bKash Integration ============
export const initiateBkashPayment = catchAsyncErrors(async (req, res, next) => {
  const { orderId, amount, customerEmail, customerPhone } = req.body

  if (!orderId || !amount || !customerEmail || !customerPhone) {
    return next(new ErrorHandler('Please provide all required fields', 400))
  }

  try {
    // Get bKash token
    const tokenResponse = await axios.post(
      `${process.env.BKASH_BASE_URL}/tokenized/checkout/token/request`,
      {
        app_key: process.env.BKASH_APP_KEY,
        app_secret: process.env.BKASH_APP_SECRET,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    )

    const accessToken = tokenResponse.data.id_token

    // Create payment request
    const paymentResponse = await axios.post(
      `${process.env.BKASH_BASE_URL}/tokenized/checkout/create`,
      {
        mode: '0011', // 0011 for checkout
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

    // Save payment intent to database
    await database.query(
      `INSERT INTO payments (order_id, payment_method, payment_intent_id, amount, currency, payment_status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [orderId, 'bKash', paymentResponse.data.paymentID, amount, 'BDT', 'pending'],
    )

    res.status(200).json({
      success: true,
      paymentURL: paymentResponse.data.bkashURL,
      paymentID: paymentResponse.data.paymentID,
    })
  } catch (error) {
    console.error('bKash Payment Error:', error)
    return next(new ErrorHandler('Failed to initiate bKash payment', 500))
  }
})

export const bkashPaymentCallback = catchAsyncErrors(async (req, res, next) => {
  const { paymentID, status } = req.query

  try {
    // Get bKash token
    const tokenResponse = await axios.post(
      `${process.env.BKASH_BASE_URL}/tokenized/checkout/token/request`,
      {
        app_key: process.env.BKASH_APP_KEY,
        app_secret: process.env.BKASH_APP_SECRET,
      },
    )

    const accessToken = tokenResponse.data.id_token

    // Execute payment
    const executeResponse = await axios.post(
      `${process.env.BKASH_BASE_URL}/tokenized/checkout/execute`,
      {
        paymentID: paymentID,
      },
      {
        headers: {
          Authorization: accessToken,
          'X-APP-Key': process.env.BKASH_APP_KEY,
        },
      },
    )

    if (executeResponse.data.statusCode === '0000') {
      // Payment successful
      await database.query(
        `UPDATE payments SET payment_status = $1, transaction_id = $2, paid_at = NOW()
         WHERE payment_intent_id = $3`,
        ['Paid', executeResponse.data.trxID, paymentID],
      )

      return res.redirect(`${process.env.FRONTEND_URL}/payment/success?paymentID=${paymentID}`)
    } else {
      // Payment failed
      await database.query(`UPDATE payments SET payment_status = $1 WHERE payment_intent_id = $2`, [
        'Failed',
        paymentID,
      ])

      return res.redirect(`${process.env.FRONTEND_URL}/payment/failed?paymentID=${paymentID}`)
    }
  } catch (error) {
    console.error('bKash Callback Error:', error)
    return res.redirect(`${process.env.FRONTEND_URL}/payment/failed`)
  }
})

// ============ Nagad Integration ============
export const initiateNagadPayment = catchAsyncErrors(async (req, res, next) => {
  const { orderId, amount, customerEmail, customerPhone } = req.body

  if (!orderId || !amount || !customerEmail || !customerPhone) {
    return next(new ErrorHandler('Please provide all required fields', 400))
  }

  try {
    const merchantId = process.env.NAGAD_MERCHANT_ID
    const merchantKey = process.env.NAGAD_MERCHANT_KEY

    // Create signature
    const payload = `${merchantId}${orderId}${amount}${process.env.BACKEND_URL}/api/v1/payment/nagad/callback`
    const signature = crypto.createHash('sha256').update(payload).digest('hex')

    const nagadPaymentData = {
      merchantId: merchantId,
      orderId: orderId,
      amount: amount,
      clientIp: req.ip,
      orderDateTime: new Date().toISOString(),
      callbackURL: `${process.env.BACKEND_URL}/api/v1/payment/nagad/callback`,
      signature: signature,
      sensitiveData: Buffer.from(
        JSON.stringify({
          phoneNumber: customerPhone,
          email: customerEmail,
        }),
      ).toString('base64'),
    }

    // Save payment intent
    await database.query(
      `INSERT INTO payments (order_id, payment_method, payment_intent_id, amount, currency, payment_status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [orderId, 'Nagad', orderId, amount, 'BDT', 'pending'],
    )

    res.status(200).json({
      success: true,
      paymentData: nagadPaymentData,
      paymentURL: `${process.env.NAGAD_BASE_URL}/checkout`,
    })
  } catch (error) {
    console.error('Nagad Payment Error:', error)
    return next(new ErrorHandler('Failed to initiate Nagad payment', 500))
  }
})

export const nagadPaymentCallback = catchAsyncErrors(async (req, res, next) => {
  const { orderId, status, tranId } = req.body

  try {
    if (status === 'Success') {
      await database.query(
        `UPDATE payments SET payment_status = $1, transaction_id = $2, paid_at = NOW()
         WHERE order_id = $3`,
        ['Paid', tranId, orderId],
      )

      return res.json({
        success: true,
        message: 'Payment successful',
      })
    } else {
      await database.query(`UPDATE payments SET payment_status = $1 WHERE order_id = $2`, [
        'Failed',
        orderId,
      ])

      return res.json({
        success: false,
        message: 'Payment failed',
      })
    }
  } catch (error) {
    console.error('Nagad Callback Error:', error)
    return next(new ErrorHandler('Callback processing failed', 500))
  }
})

// ============ Rocket Integration ============
export const initiateRocketPayment = catchAsyncErrors(async (req, res, next) => {
  const { orderId, amount, customerEmail, customerPhone } = req.body

  if (!orderId || !amount || !customerEmail || !customerPhone) {
    return next(new ErrorHandler('Please provide all required fields', 400))
  }

  try {
    const rocketData = {
      merchant_id: process.env.ROCKET_MERCHANT_ID,
      order_id: orderId,
      amount: amount,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      currency: 'BDT',
      callback_url: `${process.env.BACKEND_URL}/api/v1/payment/rocket/callback`,
      success_url: `${process.env.FRONTEND_URL}/payment/success`,
      fail_url: `${process.env.FRONTEND_URL}/payment/failed`,
    }

    // Create signature
    const signaturePayload = `${process.env.ROCKET_MERCHANT_ID}${orderId}${amount}${process.env.ROCKET_MERCHANT_PASSWORD}`
    const signature = crypto.createHash('md5').update(signaturePayload).digest('hex')

    // Save payment intent
    await database.query(
      `INSERT INTO payments (order_id, payment_method, payment_intent_id, amount, currency, payment_status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [orderId, 'Rocket', orderId, amount, 'BDT', 'pending'],
    )

    res.status(200).json({
      success: true,
      paymentData: {
        ...rocketData,
        signature: signature,
      },
      paymentURL: `${process.env.ROCKET_BASE_URL}/api/v1/payment`,
    })
  } catch (error) {
    console.error('Rocket Payment Error:', error)
    return next(new ErrorHandler('Failed to initiate Rocket payment', 500))
  }
})

export const rocketPaymentCallback = catchAsyncErrors(async (req, res, next) => {
  const { order_id, status, transactionId } = req.body

  try {
    if (status === 'Success') {
      await database.query(
        `UPDATE payments SET payment_status = $1, transaction_id = $2, paid_at = NOW()
         WHERE order_id = $3`,
        ['Paid', transactionId, order_id],
      )

      return res.json({
        success: true,
        message: 'Payment successful',
      })
    } else {
      await database.query(`UPDATE payments SET payment_status = $1 WHERE order_id = $2`, [
        'Failed',
        order_id,
      ])

      return res.json({
        success: false,
        message: 'Payment failed',
      })
    }
  } catch (error) {
    console.error('Rocket Callback Error:', error)
    return next(new ErrorHandler('Callback processing failed', 500))
  }
})

// ============ Cash on Delivery (COD) ============
export const initiateCODPayment = catchAsyncErrors(async (req, res, next) => {
  const { orderId, amount } = req.body

  if (!orderId || !amount) {
    return next(new ErrorHandler('Please provide order ID and amount', 400))
  }

  try {
    await database.query(
      `INSERT INTO payments (order_id, payment_method, amount, currency, payment_status)
       VALUES ($1, $2, $3, $4, $5)`,
      [orderId, 'COD', amount, 'BDT', 'Pending'],
    )

    res.status(201).json({
      success: true,
      message: 'Cash on Delivery initiated successfully',
      paymentMethod: 'COD',
    })
  } catch (error) {
    console.error('COD Payment Error:', error)
    return next(new ErrorHandler('Failed to initiate COD payment', 500))
  }
})

// Get payment status
export const getPaymentStatus = catchAsyncErrors(async (req, res, next) => {
  const { orderId } = req.params

  const payment = await database.query(`SELECT * FROM payments WHERE order_id = $1`, [orderId])

  if (payment.rows.length === 0) {
    return next(new ErrorHandler('Payment not found', 404))
  }

  res.status(200).json({
    success: true,
    payment: payment.rows[0],
  })
})
