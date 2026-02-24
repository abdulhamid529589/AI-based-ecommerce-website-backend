import { catchAsyncErrors } from '../middlewares/catchAsyncError.js'
import ErrorHandler from '../middlewares/errorMiddleware.js'
import { v2 as cloudinary } from 'cloudinary'
import database from '../database/db.js'
import { getAIRecommendation } from '../utils/getAIRecommendation.js'
import { broadcastProductUpdate } from '../socket/socketSetup.js'
import { deleteTempFile, deleteTempFiles } from '../utils/fileCleanup.js'

// Helper function to normalize product object (convert string numbers to numbers and parse JSON fields)
const normalizeProduct = (product) => {
  if (!product) return product

  const normalized = {
    ...product,
    // Parse numeric fields
    price: product.price ? parseFloat(product.price) : product.price,
    stock: product.stock ? parseInt(product.stock, 10) : product.stock,
    rating: product.rating ? parseFloat(product.rating) : product.rating,
    sale_price: product.sale_price ? parseFloat(product.sale_price) : null,
    cost_price: product.cost_price ? parseFloat(product.cost_price) : null,
    weight: product.weight ? parseFloat(product.weight) : null,
    length: product.length ? parseFloat(product.length) : null,
    width: product.width ? parseFloat(product.width) : null,
    height: product.height ? parseFloat(product.height) : null,
    low_stock_threshold: product.low_stock_threshold
      ? parseInt(product.low_stock_threshold, 10)
      : 10,
    menu_order: product.menu_order ? parseInt(product.menu_order, 10) : 0,
  }

  // Parse JSON fields if they're stored as strings
  if (typeof product.images === 'string') {
    try {
      normalized.images = JSON.parse(product.images)
    } catch (e) {
      normalized.images = product.images
    }
  }

  if (typeof product.tags === 'string') {
    try {
      normalized.tags = JSON.parse(product.tags)
    } catch (e) {
      normalized.tags = product.tags
    }
  }

  if (typeof product.image_alts === 'string') {
    try {
      normalized.image_alts = JSON.parse(product.image_alts)
    } catch (e) {
      normalized.image_alts = product.image_alts
    }
  }

  // Convert boolean fields from string if needed
  if (typeof product.allow_backorders === 'string') {
    normalized.allow_backorders =
      product.allow_backorders === 'true' || product.allow_backorders === true
  }
  if (typeof product.sold_individually === 'string') {
    normalized.sold_individually =
      product.sold_individually === 'true' || product.sold_individually === true
  }
  if (typeof product.free_shipping === 'string') {
    normalized.free_shipping = product.free_shipping === 'true' || product.free_shipping === true
  }
  if (typeof product.enable_reviews === 'string') {
    normalized.enable_reviews = product.enable_reviews === 'true' || product.enable_reviews === true
  }
  if (typeof product.featured === 'string') {
    normalized.featured = product.featured === 'true' || product.featured === true
  }

  return normalized
}

export const createProduct = catchAsyncErrors(async (req, res, next) => {
  // Required fields
  let { name, description, price, category, stock } = req.body

  // Optional fields
  const {
    slug,
    sku,
    barcode,
    short_description: shortDescription,
    sale_price: salePrice,
    cost_price: costPrice,
    product_type: productType = 'simple',
    weight,
    weight_unit: weightUnit = 'kg',
    length,
    width,
    height,
    low_stock_threshold: lowStockThreshold = 10,
    stock_status: stockStatus = 'in-stock',
    allow_backorders: allowBackorders = false,
    sold_individually: soldIndividually = false,
    brand,
    tags,
    shipping_class: shippingClass = 'standard',
    free_shipping: freeShipping = false,
    meta_title: metaTitle,
    meta_description: metaDescription,
    focus_keyword: focusKeyword,
    purchase_note: purchaseNote,
    enable_reviews: enableReviews = true,
    featured = false,
    visibility = 'public',
    catalog_visibility: catalogVisibility = 'visible',
    image_alts: imageAlts,
    menu_order: menuOrder = 0,
  } = req.body

  const created_by = req.user.id

  // Sanitize string inputs to prevent XSS
  const sanitizeXSS = (str) => {
    if (typeof str !== 'string') return str
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
      .replace(/on\w+\s*=\s*'[^']*'/gi, '')
      .replace(/<iframe[^>]*><\/iframe>/gi, '')
      .replace(/<img[^>]*>/gi, '')
      .replace(/javascript:/gi, '')
  }

  // Validate required fields
  name = sanitizeXSS(name)
  description = sanitizeXSS(description)
  if (category) {
    category = sanitizeXSS(category)
  }

  if (!name || !description || !price || stock === undefined) {
    return next(new ErrorHandler('Please provide: name, description, price, stock', 400))
  }

  // Upload images to Cloudinary
  let uploadedImages = []
  const tempFilePaths = [] // Track temp files for cleanup
  if (req.files && req.files.images) {
    const images = Array.isArray(req.files.images) ? req.files.images : [req.files.images]

    for (const image of images) {
      const result = await cloudinary.uploader.upload(image.tempFilePath, {
        folder: 'Ecommerce_Product_Images',
        width: 1000,
        crop: 'scale',
      })

      uploadedImages.push({
        url: result.secure_url,
        public_id: result.public_id,
      })

      // Track temp file for cleanup after successful upload
      tempFilePaths.push(image.tempFilePath)
    }

    // Clean up all temporary files after successful Cloudinary uploads
    await deleteTempFiles(tempFilePaths)
  }

  // Prepare query with essential fields + ALL optional fields
  const query = `
    INSERT INTO products (
      name, description, price, category, stock, images, created_by,
      slug, sku, barcode, short_description, sale_price, cost_price, product_type,
      weight, weight_unit, length, width, height, low_stock_threshold, stock_status,
      allow_backorders, sold_individually, brand, tags, shipping_class, free_shipping,
      meta_title, meta_description, focus_keyword, purchase_note, enable_reviews,
      featured, visibility, catalog_visibility, image_alts, menu_order
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11, $12, $13, $14,
      $15, $16, $17, $18, $19, $20, $21,
      $22, $23, $24, $25, $26, $27,
      $28, $29, $30, $31, $32,
      $33, $34, $35, $36, $37
    )
    RETURNING *
  `

  const values = [
    // Required fields
    name,
    description,
    price,
    category || 'Uncategorized',
    stock,
    JSON.stringify(uploadedImages),
    created_by,
    // Optional fields
    slug || null,
    sku || null,
    barcode || null,
    shortDescription || null,
    salePrice || null,
    costPrice || null,
    productType || 'simple',
    weight || null,
    weightUnit || 'kg',
    length || null,
    width || null,
    height || null,
    lowStockThreshold || 10,
    stockStatus || 'in-stock',
    allowBackorders || false,
    soldIndividually || false,
    brand || null,
    tags ? JSON.stringify(tags) : null,
    shippingClass || 'standard',
    freeShipping || false,
    metaTitle || null,
    metaDescription || null,
    focusKeyword || null,
    purchaseNote || null,
    enableReviews || true,
    featured || false,
    visibility || 'public',
    catalogVisibility || 'visible',
    imageAlts ? JSON.stringify(imageAlts) : null,
    menuOrder || 0,
  ]

  const product = await database.query(query, values)
  const createdProduct = normalizeProduct(product.rows[0])

  // 🔴 Broadcast product creation to all connected clients in real-time
  if (req.io) {
    console.log('📢 [Socket.IO] Broadcasting PRODUCT CREATED to frontend')
    req.io.emit('products:changed', {
      action: 'created',
      product: createdProduct,
      timestamp: new Date().toISOString(),
    })
  }

  res.status(201).json({
    success: true,
    message: 'Product created successfully.',
    product: createdProduct,
  })
})

export const fetchAllProducts = catchAsyncErrors(async (req, res, next) => {
  try {
    const { availability, price, category, ratings, search } = req.query
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 10
    const offset = (page - 1) * limit

    // Validate pagination parameters
    if (page < 1 || limit < 1) {
      return next(new ErrorHandler('Invalid pagination parameters', 400))
    }

    if (limit > 100) {
      return next(new ErrorHandler('Maximum limit is 100 products', 400))
    }

    console.log(`📦 [FETCH_ALL_PRODUCTS] Query:`, {
      page,
      limit,
      offset,
      filters: { availability, price, category, ratings, search },
    })

    const conditions = []
    let values = []
    let index = 1

    let paginationPlaceholders = {}

    // Filter products by availability
    if (availability === 'in-stock') {
      conditions.push(`stock > 5`)
    } else if (availability === 'limited') {
      conditions.push(`stock > 0 AND stock <= 5`)
    } else if (availability === 'out-of-stock') {
      conditions.push(`stock = 0`)
    }

    // Filter products by price
    if (price) {
      const [minPrice, maxPrice] = price.split('-')
      if (minPrice && maxPrice) {
        // Validate prices
        const min = parseFloat(minPrice)
        const max = parseFloat(maxPrice)
        if (isNaN(min) || isNaN(max) || min < 0 || max < min) {
          return next(new ErrorHandler('Invalid price range format. Expected: min-max', 400))
        }
        conditions.push(`price BETWEEN $${index} AND $${index + 1}`)
        values.push(min, max)
        index += 2
      }
    }

    // Filter products by category
    if (category) {
      conditions.push(`category ILIKE $${index}`)
      values.push(`%${category}%`)
      index++
    }

    // Filter products by rating
    if (ratings) {
      const rating = parseFloat(ratings)
      if (isNaN(rating) || rating < 0 || rating > 5) {
        return next(new ErrorHandler('Rating must be between 0 and 5', 400))
      }
      conditions.push(`ratings >= $${index}`)
      values.push(rating)
      index++
    }

    // Add search query
    if (search) {
      conditions.push(`(p.name ILIKE $${index} OR p.description ILIKE $${index})`)
      values.push(`%${search}%`)
      index++
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    // Get count of filtered products
    console.log(`📊 Counting filtered products...`)
    const totalProductsResult = await database.query(
      `SELECT COUNT(*) FROM products p ${whereClause}`,
      values,
    )

    const totalProducts = parseInt(totalProductsResult.rows[0].count)
    console.log(`✅ Total products found: ${totalProducts}`)

    paginationPlaceholders.limit = `$${index}`
    values.push(limit)
    index++

    paginationPlaceholders.offset = `$${index}`
    values.push(offset)
    index++

    // OPTIMIZED QUERY - Avoid N+1 and heavy aggregations using subquery
    const query = `
      SELECT p.*,
      COALESCE(rc.review_count, 0) AS review_count,
      CASE WHEN p.created_at >= NOW() - INTERVAL '30 days' THEN true ELSE false END AS is_new,
      CASE WHEN fp.id IS NOT NULL THEN true ELSE false END AS is_featured
      FROM products p
      LEFT JOIN (SELECT product_id, COUNT(*) AS review_count FROM reviews GROUP BY product_id) rc ON p.id = rc.product_id
      LEFT JOIN featured_products fp ON p.id = fp.product_id AND fp.is_active = true
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT ${paginationPlaceholders.limit}
      OFFSET ${paginationPlaceholders.offset}
    `

    console.log(`🔍 Executing main product query...`)
    const result = await database.query(query, values)
    console.log(`✅ Found ${result.rows.length} products for this page`)

    // QUERY FOR FETCHING NEW PRODUCTS
    const newProductsQuery = `
      SELECT p.*,
      COUNT(r.id) AS review_count,
      true AS is_new,
      CASE WHEN fp.id IS NOT NULL THEN true ELSE false END AS is_featured
      FROM products p
      LEFT JOIN reviews r ON p.id = r.product_id
      LEFT JOIN featured_products fp ON p.id = fp.product_id AND fp.is_active = true
      WHERE p.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY p.id, fp.id
      ORDER BY p.created_at DESC
      LIMIT 8
    `
    const newProductsResult = await database.query(newProductsQuery)

    // QUERY FOR FETCHING TOP RATING PRODUCTS (rating >= 4.5)
    const topRatedQuery = `
      SELECT p.*,
      COUNT(r.id) AS review_count,
      CASE WHEN p.created_at >= NOW() - INTERVAL '30 days' THEN true ELSE false END AS is_new,
      CASE WHEN fp.id IS NOT NULL THEN true ELSE false END AS is_featured
      FROM products p
      LEFT JOIN reviews r ON p.id = r.product_id
      LEFT JOIN featured_products fp ON p.id = fp.product_id AND fp.is_active = true
      WHERE p.ratings >= 4.5
      GROUP BY p.id, fp.id
      ORDER BY p.ratings DESC, p.created_at DESC
      LIMIT 8
    `
    const topRatedResult = await database.query(topRatedQuery)

    console.log(`✅ [SUCCESS] Returning products:`, {
      items: result.rows.length,
      total: totalProducts,
      newProducts: newProductsResult.rows.length,
      topRated: topRatedResult.rows.length,
    })

    // Normalize all products
    const normalizedProducts = result.rows.map(normalizeProduct)
    const normalizedNewProducts = newProductsResult.rows.map(normalizeProduct)
    const normalizedTopRated = topRatedResult.rows.map(normalizeProduct)

    res.status(200).json({
      success: true,
      message: 'Products fetched successfully',
      products: normalizedProducts,
      totalProducts,
      newProducts: normalizedNewProducts,
      topRatedProducts: normalizedTopRated,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error(`❌ [FETCH_ALL_PRODUCTS] Error:`, {
      message: error.message,
      stack: error.stack,
      query: req.query,
    })
    throw error
  }
})

export const updateProduct = catchAsyncErrors(async (req, res, next) => {
  const { productId } = req.params

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(productId)) {
    return next(new ErrorHandler('Invalid product ID format.', 404))
  }

  // Get existing product
  const product = await database.query('SELECT * FROM products WHERE id = $1', [productId])
  if (product.rows.length === 0) {
    return next(new ErrorHandler('Product not found.', 404))
  }

  let images = product.rows[0].images

  // Handle image updates if new images are provided
  if (req.files && req.files.images) {
    // Delete old images from Cloudinary
    if (images && images.length > 0) {
      for (const image of images) {
        try {
          await cloudinary.uploader.destroy(image.public_id)
        } catch (err) {
          console.error(`Failed to delete old image: ${err.message}`)
        }
      }
    }

    // Upload new images
    const newImages = Array.isArray(req.files.images) ? req.files.images : [req.files.images]
    const tempFilePaths = [] // Track temp files for cleanup
    images = []

    for (const file of newImages) {
      const result = await cloudinary.uploader.upload(file.tempFilePath, {
        folder: 'Ecommerce_Product_Images',
        width: 1000,
        crop: 'scale',
      })
      images.push({
        url: result.secure_url,
        public_id: result.public_id,
      })

      // Track temp file for cleanup after successful upload
      tempFilePaths.push(file.tempFilePath)
    }

    // Clean up all temporary files after successful Cloudinary uploads
    await deleteTempFiles(tempFilePaths)
  }

  // Build dynamic UPDATE query for partial updates
  // Support all fields from req.body
  const updateFields = []
  const updateValues = []
  let paramIndex = 1

  // List of updatable fields - maps form field names (snake_case from FormData) to DB columns
  const updateableFields = {
    // Required fields
    name: 'name',
    description: 'description',
    price: 'price',
    category: 'category',
    stock: 'stock',
    // Optional fields (snake_case from form submission)
    slug: 'slug',
    sku: 'sku',
    barcode: 'barcode',
    short_description: 'short_description',
    sale_price: 'sale_price',
    cost_price: 'cost_price',
    product_type: 'product_type',
    weight: 'weight',
    weight_unit: 'weight_unit',
    length: 'length',
    width: 'width',
    height: 'height',
    low_stock_threshold: 'low_stock_threshold',
    stock_status: 'stock_status',
    allow_backorders: 'allow_backorders',
    sold_individually: 'sold_individually',
    brand: 'brand',
    tags: 'tags',
    shipping_class: 'shipping_class',
    free_shipping: 'free_shipping',
    meta_title: 'meta_title',
    meta_description: 'meta_description',
    focus_keyword: 'focus_keyword',
    purchase_note: 'purchase_note',
    enable_reviews: 'enable_reviews',
    featured: 'featured',
    visibility: 'visibility',
    catalog_visibility: 'catalog_visibility',
    image_alts: 'image_alts',
    menu_order: 'menu_order',
  }

  // Dynamically add fields to update
  for (const [bodyKey, dbColumn] of Object.entries(updateableFields)) {
    if (bodyKey in req.body && req.body[bodyKey] !== undefined) {
      let value = req.body[bodyKey]

      // Special handling for JSON fields
      if (dbColumn === 'tags' || dbColumn === 'image_alts') {
        if (Array.isArray(value)) {
          value = JSON.stringify(value)
        }
      }

      // Special handling for boolean fields
      if (
        dbColumn === 'allow_backorders' ||
        dbColumn === 'sold_individually' ||
        dbColumn === 'free_shipping' ||
        dbColumn === 'enable_reviews' ||
        dbColumn === 'featured'
      ) {
        if (typeof value === 'string') {
          value = value === 'true' || value === true
        }
      }

      // Special handling for numeric fields
      if (
        [
          'price',
          'sale_price',
          'cost_price',
          'weight',
          'length',
          'width',
          'height',
          'low_stock_threshold',
          'menu_order',
        ].includes(dbColumn)
      ) {
        if (value !== null && value !== undefined && value !== '') {
          value =
            dbColumn === 'low_stock_threshold' || dbColumn === 'menu_order'
              ? parseInt(value, 10)
              : parseFloat(value)
        }
      }

      updateFields.push(`${dbColumn} = $${paramIndex}`)
      updateValues.push(value)
      paramIndex++
    }
  }

  // Always update images if they were processed
  if (req.files && req.files.images) {
    updateFields.push(`images = $${paramIndex}`)
    updateValues.push(JSON.stringify(images))
    paramIndex++
  }

  // Check if there are any fields to update
  if (updateFields.length === 0) {
    return next(new ErrorHandler('No fields to update provided.', 400))
  }

  // Build final query
  const updateQuery = `UPDATE products SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`
  updateValues.push(productId)

  const result = await database.query(updateQuery, updateValues)
  const updatedProduct = normalizeProduct(result.rows[0])

  // 🔴 Broadcast product update to all connected clients in real-time
  if (req.io) {
    console.log('📢 [Socket.IO] Broadcasting PRODUCT UPDATED to frontend')
    req.io.emit('products:changed', {
      action: 'updated',
      product: updatedProduct,
      timestamp: new Date().toISOString(),
    })
  }

  res.status(200).json({
    success: true,
    message: 'Product updated successfully.',
    product: updatedProduct,
  })
})

export const deleteProduct = catchAsyncErrors(async (req, res, next) => {
  const { productId } = req.params

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(productId)) {
    return next(new ErrorHandler('Invalid product ID format.', 404))
  }

  const product = await database.query('SELECT * FROM products WHERE id = $1', [productId])
  if (product.rows.length === 0) {
    return next(new ErrorHandler('Product not found.', 404))
  }

  const images = product.rows[0].images

  const deleteResult = await database.query('DELETE FROM products WHERE id = $1 RETURNING *', [
    productId,
  ])

  if (deleteResult.rows.length === 0) {
    return next(new ErrorHandler('Failed to delete product.', 500))
  }

  // Delete images from Cloudinary
  if (images && images.length > 0) {
    for (const image of images) {
      await cloudinary.uploader.destroy(image.public_id)
    }
  }

  // 🔴 Broadcast product deletion to all connected clients in real-time
  if (req.io) {
    console.log('📢 [Socket.IO] Broadcasting PRODUCT DELETED to frontend')
    req.io.emit('products:changed', {
      action: 'deleted',
      productId: productId,
      timestamp: new Date().toISOString(),
    })
  }

  res.status(200).json({
    success: true,
    message: 'Product deleted successfully.',
  })
})

export const fetchSingleProduct = catchAsyncErrors(async (req, res, next) => {
  const { productId } = req.params

  // Validate product ID - accept both UUID and numeric formats
  if (!productId || typeof productId !== 'string' || productId.trim() === '') {
    console.error(`❌ [FETCH_SINGLE_PRODUCT] Invalid product ID: ${productId}`)
    return next(new ErrorHandler('Invalid product ID provided', 400))
  }

  console.log(`📖 [FETCH_SINGLE_PRODUCT] Fetching product ${productId}...`)

  try {
    const result = await database.query(
      `
        SELECT p.*,
        COUNT(r.id) AS review_count,
        COALESCE(
        json_agg(
        json_build_object(
            'id', r.id,
            'rating', r.rating::INT,
            'title', r.title,
            'content', r.content,
            'comment', r.comment,
            'verified_purchase', r.verified_purchase,
            'helpful_count', r.helpful_count,
            'user_id', r.user_id,
            'reviewer_name', COALESCE(u.name, 'Anonymous'),
            'user_name', u.name,
            'created_at', r.created_at,
            'updated_at', r.updated_at
        )
        ORDER BY r.created_at DESC
        ) FILTER (WHERE r.id IS NOT NULL), '[]') AS reviews
         FROM products p
         LEFT JOIN reviews r ON p.id = r.product_id
         LEFT JOIN users u ON r.user_id = u.id
         WHERE p.id = $1
         GROUP BY p.id`,
      [productId],
    )

    if (!result.rows || result.rows.length === 0) {
      console.warn(`⚠️ [FETCH_SINGLE_PRODUCT] Product ${productId} not found`)
      return next(new ErrorHandler(`Product with ID ${productId} not found`, 404))
    }

    let product = result.rows[0]

    // Normalize the product (parse JSON, convert types)
    product = normalizeProduct(product)

    console.log(`✅ [FETCH_SINGLE_PRODUCT] Product found:`, {
      id: product.id,
      name: product.name,
      reviews: product.review_count,
      fields: Object.keys(product).filter((k) => product[k] !== null && product[k] !== undefined)
        .length,
    })

    res.status(200).json({
      success: true,
      message: 'Product fetched successfully.',
      data: product,
    })
  } catch (error) {
    console.error(`❌ [FETCH_SINGLE_PRODUCT] Error fetching product ${productId}:`, {
      message: error.message,
      stack: error.stack,
    })
    throw error
  }
})

export const postProductReview = catchAsyncErrors(async (req, res, next) => {
  const { productId } = req.params
  const { rating, comment } = req.body
  const userId = req.user?.id

  // Validate inputs
  if (!userId) {
    console.error(`❌ [POST_REVIEW] User not authenticated`)
    return next(new ErrorHandler('User authentication required', 401))
  }

  if (!productId || typeof productId !== 'string' || productId.trim() === '') {
    console.error(`❌ [POST_REVIEW] Invalid product ID: ${productId}`)
    return next(new ErrorHandler('Invalid product ID', 400))
  }

  if (!rating) {
    console.error(`❌ [POST_REVIEW] Missing rating`)
    return next(new ErrorHandler('Please provide a rating', 400))
  }

  const ratingNum = parseInt(rating)
  if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    console.error(`❌ [POST_REVIEW] Invalid rating: ${rating}`)
    return next(new ErrorHandler('Rating must be a number between 1 and 5', 400))
  }

  if (!comment || typeof comment !== 'string' || comment.trim().length === 0) {
    console.error(`❌ [POST_REVIEW] Missing or invalid comment`)
    return next(new ErrorHandler('Please provide a comment', 400))
  }

  console.log(`⭐ [POST_REVIEW] Processing review for product ${productId} by user ${userId}`)

  try {
    // Check if product exists
    const productCheck = await database.query('SELECT id FROM products WHERE id = $1', [productId])
    if (productCheck.rows.length === 0) {
      console.warn(`⚠️ [POST_REVIEW] Product ${productId} not found`)
      return next(new ErrorHandler('Product not found', 404))
    }

    // Verify user has purchased the product
    const purchaseCheckQuery = `
      SELECT oi.product_id
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN payments p ON p.order_id = o.id
      WHERE o.buyer_id = $1
      AND oi.product_id = $2
      AND p.payment_status = 'Paid'
      LIMIT 1
    `

    const { rows: purchaseRows } = await database.query(purchaseCheckQuery, [userId, productId])

    if (purchaseRows.length === 0) {
      console.warn(`⚠️ [POST_REVIEW] User ${userId} has not purchased product ${productId}`)
      return res.status(403).json({
        success: false,
        message: "You can only review products you've purchased",
      })
    }

    console.log(`✅ [POST_REVIEW] Purchase verified for user ${userId}`)

    // Check if user already reviewed this product
    const existingReview = await database.query(
      `SELECT * FROM reviews WHERE product_id = $1 AND user_id = $2`,
      [productId, userId],
    )

    let review

    if (existingReview.rows.length > 0) {
      console.log(`🔄 [POST_REVIEW] Updating existing review...`)
      review = await database.query(
        'UPDATE reviews SET rating = $1, comment = $2 WHERE product_id = $3 AND user_id = $4 RETURNING *',
        [ratingNum, comment.trim(), productId, userId],
      )
    } else {
      console.log(`📝 [POST_REVIEW] Creating new review...`)
      review = await database.query(
        'INSERT INTO reviews (product_id, user_id, rating, comment) VALUES ($1, $2, $3, $4) RETURNING *',
        [productId, userId, ratingNum, comment.trim()],
      )
    }

    // Calculate average rating
    const avgRatingResult = await database.query(
      `SELECT AVG(rating::NUMERIC) AS avg_rating, COUNT(*) AS total_reviews FROM reviews WHERE product_id = $1`,
      [productId],
    )

    const newAvgRating = avgRatingResult.rows[0]?.avg_rating
      ? parseFloat(avgRatingResult.rows[0].avg_rating)
      : 0
    const totalReviews = parseInt(avgRatingResult.rows[0]?.total_reviews || 0)

    // Update product rating
    await database.query('UPDATE products SET ratings = $1 WHERE id = $2', [
      newAvgRating,
      productId,
    ])

    console.log(`✅ [POST_REVIEW] Review processed successfully:`, {
      reviewId: review.rows[0].id,
      newAvgRating,
      totalReviews,
    })

    res.status(201).json({
      success: true,
      message:
        existingReview.rows.length > 0
          ? 'Review updated successfully'
          : 'Review posted successfully',
      review: review.rows[0],
      productRating: newAvgRating,
      totalReviews,
    })
  } catch (error) {
    console.error(`❌ [POST_REVIEW] Error:`, {
      message: error.message,
      stack: error.stack,
      productId,
      userId,
    })
    throw error
  }
})

export const deleteReview = catchAsyncErrors(async (req, res, next) => {
  const { productId } = req.params
  const userId = req.user?.id

  // Validate inputs
  if (!userId) {
    console.error(`❌ [DELETE_REVIEW] User not authenticated`)
    return next(new ErrorHandler('User authentication required', 401))
  }

  if (!productId || typeof productId !== 'string' || productId.trim() === '') {
    console.error(`❌ [DELETE_REVIEW] Invalid product ID: ${productId}`)
    return next(new ErrorHandler('Invalid product ID', 400))
  }

  console.log(`🗑️ [DELETE_REVIEW] Deleting review for product ${productId} by user ${userId}`)

  try {
    const review = await database.query(
      'DELETE FROM reviews WHERE product_id = $1 AND user_id = $2 RETURNING *',
      [productId, userId],
    )

    if (review.rows.length === 0) {
      console.warn(`⚠️ [DELETE_REVIEW] No review found for user ${userId} on product ${productId}`)
      return next(new ErrorHandler('Review not found', 404))
    }

    console.log(`✅ [DELETE_REVIEW] Review deleted, recalculating product rating...`)

    // Recalculate average rating
    const avgRatingResult = await database.query(
      `SELECT AVG(rating::NUMERIC) AS avg_rating, COUNT(*) AS total_reviews FROM reviews WHERE product_id = $1`,
      [productId],
    )

    const newAvgRating = avgRatingResult.rows[0]?.avg_rating
      ? parseFloat(avgRatingResult.rows[0].avg_rating)
      : 0
    const totalReviews = parseInt(avgRatingResult.rows[0]?.total_reviews || 0)

    // Update product rating
    await database.query('UPDATE products SET ratings = $1 WHERE id = $2', [
      newAvgRating,
      productId,
    ])

    console.log(`✅ [DELETE_REVIEW] Completed:`, {
      productId,
      newAvgRating,
      totalReviews,
    })

    res.status(200).json({
      success: true,
      message: 'Review deleted successfully',
      productRating: newAvgRating,
      totalReviews,
    })
  } catch (error) {
    console.error(`❌ [DELETE_REVIEW] Error:`, {
      message: error.message,
      stack: error.stack,
      productId,
      userId,
    })
    throw error
  }
})

export const fetchAIFilteredProducts = catchAsyncErrors(async (req, res, next) => {
  const { userPrompt } = req.body
  if (!userPrompt) {
    return next(new ErrorHandler('Provide a valid prompt.', 400))
  }

  const filterKeywords = (query) => {
    const stopWords = new Set([
      'the',
      'they',
      'them',
      'then',
      'I',
      'we',
      'you',
      'he',
      'she',
      'it',
      'is',
      'a',
      'an',
      'of',
      'and',
      'or',
      'to',
      'for',
      'from',
      'on',
      'who',
      'whom',
      'why',
      'when',
      'which',
      'with',
      'this',
      'that',
      'in',
      'at',
      'by',
      'be',
      'not',
      'was',
      'were',
      'has',
      'have',
      'had',
      'do',
      'does',
      'did',
      'so',
      'some',
      'any',
      'how',
      'can',
      'could',
      'should',
      'would',
      'there',
      'here',
      'just',
      'than',
      'because',
      'but',
      'its',
      "it's",
      'if',
      '.',
      ',',
      '!',
      '?',
      '>',
      '<',
      ';',
      '`',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
    ])

    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((word) => !stopWords.has(word))
      .map((word) => `%${word}%`)
  }

  const keywords = filterKeywords(userPrompt)
  // STEP 1: Basic SQL Filtering
  const result = await database.query(
    `
        SELECT * FROM products
        WHERE name ILIKE ANY($1)
        OR description ILIKE ANY($1)
        OR category ILIKE ANY($1)
        LIMIT 200;
        `,
    [keywords],
  )

  const filteredProducts = result.rows

  if (filteredProducts.length === 0) {
    return res.status(200).json({
      success: true,
      message: 'No products found matching your prompt.',
      products: [],
    })
  }

  // STEP 2: AI FILTERING
  const { success, products } = await getAIRecommendation(req, res, userPrompt, filteredProducts)

  res.status(200).json({
    success: success,
    message: 'AI filtered products.',
    products,
  })
})

// Bulk product import
export const bulkImportProducts = catchAsyncErrors(async (req, res, next) => {
  const { products: productsToImport } = req.body
  const created_by = req.user.id

  if (!Array.isArray(productsToImport) || productsToImport.length === 0) {
    return next(new ErrorHandler('Please provide an array of products to import.', 400))
  }

  const importedProducts = []

  for (const product of productsToImport) {
    const { name, category, price, stock, status, description } = product

    if (!name || !price || !stock) {
      continue // Skip invalid products
    }

    const result = await database.query(
      `INSERT INTO products (name, category, price, stock, description, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        name,
        category || 'Uncategorized',
        price,
        stock,
        description || '',
        status || 'active',
        created_by,
      ],
    )

    importedProducts.push(result.rows[0])
  }

  res.status(201).json({
    success: true,
    message: `${importedProducts.length} products imported successfully.`,
    importedCount: importedProducts.length,
    products: importedProducts,
  })
})

// Duplicate product
export const duplicateProduct = catchAsyncErrors(async (req, res, next) => {
  const { productId } = req.params
  const created_by = req.user.id

  const product = await database.query('SELECT * FROM products WHERE id = $1', [productId])

  if (product.rows.length === 0) {
    return next(new ErrorHandler('Product not found.', 404))
  }

  const originalProduct = product.rows[0]
  const newProduct = await database.query(
    `INSERT INTO products (name, description, price, category, stock, images, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      `${originalProduct.name} (Copy)`,
      originalProduct.description,
      originalProduct.price,
      originalProduct.category,
      originalProduct.stock,
      originalProduct.images,
      created_by,
    ],
  )

  res.status(201).json({
    success: true,
    message: 'Product duplicated successfully.',
    product: newProduct.rows[0],
  })
})

// Get product reviews
export const getProductReviews = catchAsyncErrors(async (req, res, next) => {
  const { productId } = req.params
  const { page = 1, limit = 10 } = req.query

  const offset = (page - 1) * limit

  const reviews = await database.query(
    `SELECT r.*, u.name as user_name, u.email as user_email
     FROM reviews r
     JOIN users u ON r.user_id = u.id
     WHERE r.product_id = $1
     ORDER BY r.created_at DESC
     LIMIT $2 OFFSET $3`,
    [productId, limit, offset],
  )

  const totalReviews = await database.query('SELECT COUNT(*) FROM reviews WHERE product_id = $1', [
    productId,
  ])

  res.status(200).json({
    success: true,
    reviews: reviews.rows,
    totalReviews: parseInt(totalReviews.rows[0].count),
  })
})

// Approve/Unapprove review
export const updateReviewStatus = catchAsyncErrors(async (req, res, next) => {
  const { reviewId } = req.params
  const { approved } = req.body

  const result = await database.query(
    'UPDATE reviews SET approved = $1 WHERE id = $2 RETURNING *',
    [approved, reviewId],
  )

  if (result.rows.length === 0) {
    return next(new ErrorHandler('Review not found.', 404))
  }

  res.status(200).json({
    success: true,
    message: `Review ${approved ? 'approved' : 'unapproved'} successfully.`,
    review: result.rows[0],
  })
})

// Admin delete review
export const adminDeleteReview = catchAsyncErrors(async (req, res, next) => {
  const { reviewId } = req.params

  const review = await database.query('SELECT * FROM reviews WHERE id = $1', [reviewId])

  if (review.rows.length === 0) {
    return next(new ErrorHandler('Review not found.', 404))
  }

  const productId = review.rows[0].product_id

  await database.query('DELETE FROM reviews WHERE id = $1', [reviewId])

  // Update product rating
  const allReviews = await database.query(
    `SELECT AVG(rating::NUMERIC) AS avg_rating FROM reviews WHERE product_id = $1`,
    [productId],
  )

  const newAvgRating = allReviews.rows[0].avg_rating ? parseFloat(allReviews.rows[0].avg_rating) : 0

  await database.query(`UPDATE products SET ratings = $1 WHERE id = $2`, [newAvgRating, productId])

  res.status(200).json({
    success: true,
    message: 'Review deleted successfully.',
  })
})

// Get product analytics
export const getProductAnalytics = catchAsyncErrors(async (req, res, next) => {
  const { productId } = req.params
  const { dateFrom, dateTo } = req.query

  let query = `
    SELECT
      p.id,
      p.name,
      COUNT(DISTINCT o.id) as total_sales,
      SUM(oi.quantity) as total_quantity_sold,
      SUM(oi.quantity * oi.price) as total_revenue,
      COUNT(DISTINCT CASE WHEN v.action = 'view' THEN v.id END) as views,
      COUNT(DISTINCT CASE WHEN v.action = 'add_to_cart' THEN v.id END) as add_to_cart,
      ROUND(
        CAST(COUNT(DISTINCT o.id) AS NUMERIC) /
        NULLIF(COUNT(DISTINCT CASE WHEN v.action = 'view' THEN v.id END), 0) * 100,
        2
      ) as conversion_rate
    FROM products p
    LEFT JOIN order_items oi ON p.id = oi.product_id
    LEFT JOIN orders o ON oi.order_id = o.id
    LEFT JOIN product_views v ON p.id = v.product_id
    WHERE p.id = $1
  `

  const values = [productId]
  let paramIndex = 2

  if (dateFrom) {
    query += ` AND o.created_at >= $${paramIndex}`
    values.push(dateFrom)
    paramIndex++
  }

  if (dateTo) {
    query += ` AND o.created_at <= $${paramIndex}`
    values.push(dateTo)
    paramIndex++
  }

  query += ` GROUP BY p.id, p.name`

  const result = await database.query(query, values)

  res.status(200).json({
    success: true,
    analytics: result.rows[0] || {},
  })
})
export const searchSuggestions = catchAsyncErrors(async (req, res, next) => {
  const { query } = req.query

  if (!query || query.length < 2) {
    return res.status(200).json({
      success: true,
      suggestions: [],
    })
  }

  const result = await database.query(
    `
    SELECT DISTINCT name
    FROM products
    WHERE name ILIKE $1 OR category ILIKE $1
    LIMIT 10
    `,
    [`%${query}%`],
  )

  const suggestions = result.rows.map((row) => row.name)

  res.status(200).json({
    success: true,
    suggestions,
  })
})

export const trendingProducts = catchAsyncErrors(async (req, res, next) => {
  // Get trending products based on recent orders
  const result = await database.query(
    `
    SELECT
      p.id,
      p.name,
      p.price,
      p.category,
      p.ratings,
      p.images,
      COUNT(oi.id) as order_count
    FROM products p
    LEFT JOIN order_items oi ON p.id = oi.product_id
    WHERE oi.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY p.id
    ORDER BY order_count DESC
    LIMIT 10
    `,
  )

  const trendingProducts = result.rows.map((row) => ({
    ...row,
    order_count: parseInt(row.order_count),
  }))

  res.status(200).json({
    success: true,
    products: trendingProducts,
  })
})

export const markReviewHelpful = catchAsyncErrors(async (req, res, next) => {
  const { reviewId } = req.params

  // Get current helpful count
  const reviewResult = await database.query(
    'SELECT helpful_count FROM product_reviews WHERE id = $1',
    [reviewId],
  )

  if (reviewResult.rows.length === 0) {
    return next(new ErrorHandler('Review not found', 404))
  }

  const currentCount = reviewResult.rows[0].helpful_count || 0

  // Increment helpful count
  const updated = await database.query(
    'UPDATE product_reviews SET helpful_count = $1 WHERE id = $2 RETURNING *',
    [currentCount + 1, reviewId],
  )

  res.status(200).json({
    success: true,
    message: 'Review marked as helpful',
    helpful_count: updated.rows[0].helpful_count,
  })
})
