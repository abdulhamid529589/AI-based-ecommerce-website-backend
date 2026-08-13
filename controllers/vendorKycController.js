import { catchAsyncErrors } from '../middlewares/catchAsyncError.js'
import ErrorHandler from '../middlewares/errorMiddleware.js'
import database from '../database/db.js'

const sanitize = (str) => {
  if (typeof str !== 'string') return str
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '')
    .trim()
}

const DOC_TYPES = ['nid_front', 'nid_back', 'trade_license', 'selfie', 'bank_proof', 'other']

export const getMyKyc = catchAsyncErrors(async (req, res, next) => {
  if (!req.shop) return next(new ErrorHandler('Shop required.', 400))

  const docs = await database.query(
    `SELECT id, doc_type, file, status, notes, uploaded_at, reviewed_at
     FROM shop_kyc_documents WHERE shop_id = $1
     ORDER BY uploaded_at DESC`,
    [req.shop.id],
  )

  res.status(200).json({
    success: true,
    kyc: {
      status: req.shop.kyc_status || 'not_submitted',
      business_name: req.shop.business_name,
      nid_number: req.shop.nid_number,
      trade_license_number: req.shop.trade_license_number,
      bank_name: req.shop.bank_name,
      bank_account_name: req.shop.bank_account_name,
      bank_account_number: req.shop.bank_account_number
        ? String(req.shop.bank_account_number).replace(/.(?=.{4})/g, '•')
        : null,
      bank_routing_number: req.shop.bank_routing_number,
      kyc_submitted_at: req.shop.kyc_submitted_at,
      kyc_reviewed_at: req.shop.kyc_reviewed_at,
      kyc_rejection_reason: req.shop.kyc_rejection_reason,
    },
    documents: docs.rows,
  })
})

export const submitMyKyc = catchAsyncErrors(async (req, res, next) => {
  if (!req.shop) return next(new ErrorHandler('Shop required.', 400))

  const {
    business_name,
    nid_number,
    trade_license_number,
    bank_name,
    bank_account_name,
    bank_account_number,
    bank_routing_number,
    documents,
  } = req.body

  if (!business_name || String(business_name).trim().length < 2) {
    return next(new ErrorHandler('Business name is required.', 400))
  }
  if (!nid_number || String(nid_number).trim().length < 5) {
    return next(new ErrorHandler('National ID / NID number is required.', 400))
  }

  const docs = Array.isArray(documents) ? documents : []
  for (const doc of docs) {
    if (!DOC_TYPES.includes(doc.doc_type)) {
      return next(new ErrorHandler(`Invalid document type: ${doc.doc_type}`, 400))
    }
    if (!doc.file?.url) {
      return next(new ErrorHandler('Each document needs a file.url', 400))
    }
  }

  const result = await database.query(
    `UPDATE shops SET
       business_name = $1,
       nid_number = $2,
       trade_license_number = $3,
       bank_name = $4,
       bank_account_name = $5,
       bank_account_number = COALESCE($6, bank_account_number),
       bank_routing_number = $7,
       kyc_status = 'pending',
       kyc_submitted_at = CURRENT_TIMESTAMP,
       kyc_rejection_reason = NULL,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $8
     RETURNING *`,
    [
      sanitize(business_name),
      sanitize(String(nid_number)),
      trade_license_number ? sanitize(String(trade_license_number)) : null,
      bank_name ? sanitize(bank_name) : null,
      bank_account_name ? sanitize(bank_account_name) : null,
      bank_account_number ? sanitize(String(bank_account_number)) : null,
      bank_routing_number ? sanitize(String(bank_routing_number)) : null,
      req.shop.id,
    ],
  )

  for (const doc of docs) {
    await database.query(
      `INSERT INTO shop_kyc_documents (shop_id, doc_type, file, status)
       VALUES ($1, $2, $3, 'pending')`,
      [
        req.shop.id,
        doc.doc_type,
        JSON.stringify({
          url: String(doc.file.url).slice(0, 2000),
          public_id: doc.file.public_id || null,
        }),
      ],
    )
  }

  res.status(200).json({
    success: true,
    message: 'KYC submitted for review.',
    shop: result.rows[0],
  })
})

export const adminReviewKyc = catchAsyncErrors(async (req, res, next) => {
  const { kyc_status, kyc_rejection_reason, is_verified } = req.body
  if (!['approved', 'rejected', 'pending'].includes(kyc_status)) {
    return next(new ErrorHandler('kyc_status must be approved, rejected, or pending.', 400))
  }

  const shop = await database.query(`SELECT * FROM shops WHERE id = $1`, [req.params.shopId])
  if (!shop.rows[0]) return next(new ErrorHandler('Shop not found.', 404))

  if (kyc_status === 'rejected' && !kyc_rejection_reason) {
    return next(new ErrorHandler('Rejection reason is required.', 400))
  }

  const result = await database.query(
    `UPDATE shops SET
       kyc_status = $1,
       kyc_rejection_reason = $2,
       kyc_reviewed_at = CURRENT_TIMESTAMP,
       kyc_reviewed_by = $3,
       is_verified = CASE
         WHEN $1 = 'approved' THEN COALESCE($4, true)
         WHEN $1 = 'rejected' THEN false
         ELSE is_verified
       END,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $5
     RETURNING *`,
    [
      kyc_status,
      kyc_status === 'rejected' ? sanitize(kyc_rejection_reason) : null,
      req.user.id,
      typeof is_verified === 'boolean' ? is_verified : null,
      req.params.shopId,
    ],
  )

  if (kyc_status === 'approved' || kyc_status === 'rejected') {
    await database.query(
      `UPDATE shop_kyc_documents SET
         status = $1,
         reviewed_at = CURRENT_TIMESTAMP,
         reviewed_by = $2
       WHERE shop_id = $3 AND status = 'pending'`,
      [kyc_status === 'approved' ? 'approved' : 'rejected', req.user.id, req.params.shopId],
    )
  }

  res.status(200).json({
    success: true,
    message: `KYC ${kyc_status}.`,
    shop: result.rows[0],
  })
})
