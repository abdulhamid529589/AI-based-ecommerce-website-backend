import { catchAsyncErrors } from '../middlewares/catchAsyncError.js'
import ErrorHandler from '../middlewares/errorMiddleware.js'
import { v2 as cloudinary } from 'cloudinary'
import database from '../database/db.js'
import { getAIRecommendation } from '../utils/getAIRecommendation.js'

export const createProduct = catchAsyncErrors(async (req, res, next) => {
  const { name, description, price, category, stock } = req.body
  const created_by = req.user.id

  if (!name || !description || !price || !category || !stock) {
    return next(new ErrorHandler('Please provide complete product details.', 400))
  }

  let uploadedImages = []
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
    }
  }

  const product = await database.query(
    `INSERT INTO products (name, description, price, category, stock, images, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [name, description, price, category, stock, JSON.stringify(uploadedImages), created_by],
  )

  res.status(201).json({
    success: true,
    message: 'Product created successfully.',
    product: product.rows[0],
  })
})

export const fetchAllProducts = catchAsyncErrors(async (req, res, next) => {
  const { availability, price, category, ratings, search } = req.query
  const page = parseInt(req.query.page) || 1
  const limit = parseInt(req.query.limit) || 10
  const offset = (page - 1) * limit

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
      conditions.push(`price BETWEEN $${index} AND $${index + 1}`)
      values.push(minPrice, maxPrice)
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
    conditions.push(`ratings >= $${index}`)
    values.push(ratings)
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
  const totalProductsResult = await database.query(
    `SELECT COUNT(*) FROM products p ${whereClause}`,
    values,
  )

  const totalProducts = parseInt(totalProductsResult.rows[0].count)

  paginationPlaceholders.limit = `$${index}`
  values.push(limit)
  index++

  paginationPlaceholders.offset = `$${index}`
  values.push(offset)
  index++

  // FETCH WITH REVIEWS AND FEATURED STATUS
  const query = `
    SELECT p.*,
    COUNT(r.id) AS review_count,
    CASE WHEN p.created_at >= NOW() - INTERVAL '30 days' THEN true ELSE false END AS is_new,
    CASE WHEN fp.id IS NOT NULL THEN true ELSE false END AS is_featured
    FROM products p
    LEFT JOIN reviews r ON p.id = r.product_id
    LEFT JOIN featured_products fp ON p.id = fp.product_id AND fp.is_active = true
    ${whereClause}
    GROUP BY p.id, fp.id
    ORDER BY p.created_at DESC
    LIMIT ${paginationPlaceholders.limit}
    OFFSET ${paginationPlaceholders.offset}
    `

  const result = await database.query(query, values)

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

  res.status(200).json({
    success: true,
    products: result.rows,
    totalProducts,
    newProducts: newProductsResult.rows,
    topRatedProducts: topRatedResult.rows,
  })
})

export const updateProduct = catchAsyncErrors(async (req, res, next) => {
  const { productId } = req.params
  const { name, description, price, category, stock } = req.body

  if (!name || !description || !price || !category || !stock === undefined) {
    return next(new ErrorHandler('Please provide complete product details.', 400))
  }
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
    images = []

    for (const file of newImages) {
      const result = await cloudinary.uploader.upload(file.tempFilePath, {
        folder: 'products',
        transformation: [{ width: 1000, crop: 'scale' }],
        resource_type: 'auto',
      })
      images.push({
        public_id: result.public_id,
        url: result.secure_url,
      })
    }
  }

  const result = await database.query(
    `UPDATE products SET name = $1, description = $2, price = $3, category = $4, stock = $5, images = $6, updated_at = NOW() WHERE id = $7 RETURNING *`,
    [name, description, price, category, stock, JSON.stringify(images), productId],
  )
  res.status(200).json({
    success: true,
    message: 'Product updated successfully.',
    updatedProduct: result.rows[0],
  })
})

export const deleteProduct = catchAsyncErrors(async (req, res, next) => {
  const { productId } = req.params

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

  res.status(200).json({
    success: true,
    message: 'Product deleted successfully.',
  })
})

export const fetchSingleProduct = catchAsyncErrors(async (req, res, next) => {
  const { productId } = req.params

  const result = await database.query(
    `
        SELECT p.*,
        COUNT(r.id) AS review_count,
        COALESCE(
        json_agg(
        json_build_object(
            'id', r.id,
            'rating', r.rating::INT,
            'comment', r.comment,
            'user_id', r.user_id,
            'user_name', u.name,
            'created_at', r.created_at
        )
        ORDER BY r.created_at DESC
        ) FILTER (WHERE r.id IS NOT NULL), '[]') AS reviews
         FROM products p
         LEFT JOIN reviews r ON p.id = r.product_id
         LEFT JOIN users u ON r.user_id = u.id
         WHERE p.id  = $1
         GROUP BY p.id`,
    [productId],
  )

  res.status(200).json({
    success: true,
    message: 'Product fetched successfully.',
    product: result.rows[0],
  })
})

export const postProductReview = catchAsyncErrors(async (req, res, next) => {
  const { productId } = req.params
  const { rating, comment } = req.body

  if (!rating || !comment) {
    return next(new ErrorHandler('Please provide rating and comment.', 400))
  }

  if (rating < 1 || rating > 5) {
    return next(new ErrorHandler('Rating must be between 1 and 5.', 400))
  }

  const purchasheCheckQuery = `
    SELECT oi.product_id
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN payments p ON p.order_id = o.id
    WHERE o.buyer_id = $1
    AND oi.product_id = $2
    AND p.payment_status = 'Paid'
    LIMIT 1
  `

  const { rows } = await database.query(purchasheCheckQuery, [req.user.id, productId])

  if (rows.length === 0) {
    return res.status(403).json({
      success: false,
      message: "You can only review a product you've purchased.",
    })
  }

  const product = await database.query('SELECT * FROM products WHERE id = $1', [productId])
  if (product.rows.length === 0) {
    return next(new ErrorHandler('Product not found.', 404))
  }

  const isAlreadyReviewed = await database.query(
    `SELECT * FROM reviews WHERE product_id = $1 AND user_id = $2`,
    [productId, req.user.id],
  )

  let review

  if (isAlreadyReviewed.rows.length > 0) {
    review = await database.query(
      'UPDATE reviews SET rating = $1, comment = $2 WHERE product_id = $3 AND user_id = $4 RETURNING *',
      [rating, comment, productId, req.user.id],
    )
  } else {
    review = await database.query(
      'INSERT INTO reviews (product_id, user_id, rating, comment) VALUES ($1, $2, $3, $4) RETURNING *',
      [productId, req.user.id, rating, comment],
    )
  }

  // Get all reviews for average
  const allReviews = await database.query(
    `SELECT AVG(rating::NUMERIC) AS avg_rating, COUNT(*) AS total_reviews FROM reviews WHERE product_id = $1`,
    [productId],
  )

  const newAvgRating = allReviews.rows[0].avg_rating ? parseFloat(allReviews.rows[0].avg_rating) : 0

  const updatedProduct = await database.query(
    `UPDATE products SET ratings = $1 WHERE id = $2 RETURNING *`,
    [Math.round(newAvgRating * 10) / 10, productId],
  )

  // Fetch all reviews with user info for the response
  const allReviewsWithUserInfo = await database.query(
    `SELECT r.*, u.name as user_name FROM reviews r
     JOIN users u ON r.user_id = u.id
     WHERE r.product_id = $1
     ORDER BY r.created_at DESC`,
    [productId],
  )

  res.status(200).json({
    success: true,
    message: 'Review posted successfully.',
    review: review.rows[0],
    reviews: allReviewsWithUserInfo.rows,
    product: updatedProduct.rows[0],
  })
})

export const deleteReview = catchAsyncErrors(async (req, res, next) => {
  const { productId } = req.params

  const review = await database.query(
    'DELETE FROM reviews WHERE product_id = $1 AND user_id = $2 RETURNING *',
    [productId, req.user.id],
  )

  if (review.rows.length === 0) {
    return next(new ErrorHandler('Review not found.', 404))
  }

  // Get updated average rating
  const allReviews = await database.query(
    `SELECT AVG(rating::NUMERIC) AS avg_rating FROM reviews WHERE product_id = $1`,
    [productId],
  )

  const newAvgRating = allReviews.rows[0].avg_rating ? parseFloat(allReviews.rows[0].avg_rating) : 0

  const updatedProduct = await database.query(
    `UPDATE products SET ratings = $1 WHERE id = $2 RETURNING *`,
    [Math.round(newAvgRating * 10) / 10, productId],
  )

  // Fetch all reviews with user info
  const allReviewsWithUserInfo = await database.query(
    `SELECT r.*, u.name as user_name FROM reviews r
     JOIN users u ON r.user_id = u.id
     WHERE r.product_id = $1
     ORDER BY r.created_at DESC`,
    [productId],
  )

  res.status(200).json({
    success: true,
    message: 'Your review has been deleted.',
    review: review.rows[0],
    reviews: allReviewsWithUserInfo.rows,
    product: updatedProduct.rows[0],
  })
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
    const { name, sku, category, price, stock, status, description } = product

    if (!name || !price || !stock) {
      continue // Skip invalid products
    }

    const result = await database.query(
      `INSERT INTO products (name, sku, category, price, stock, description, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        name,
        sku || '',
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
    `INSERT INTO products (name, description, price, category, stock, sku, images, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      `${originalProduct.name} (Copy)`,
      originalProduct.description,
      originalProduct.price,
      originalProduct.category,
      originalProduct.stock,
      `${originalProduct.sku}-copy-${Date.now()}`,
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
