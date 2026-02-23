import db from '../database/db.js'
import { getSetting, setSetting } from '../models/settingsTable.js'
import { v2 as cloudinary } from 'cloudinary'

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLIENT_NAME,
  api_key: process.env.CLOUDINARY_CLIENT_API,
  api_secret: process.env.CLOUDINARY_CLIENT_SECRET,
})

// Shop Info Endpoints
export const getShopInfo = async (req, res) => {
  try {
    let shopInfo = null
    try {
      shopInfo = await getSetting('shop_info')
    } catch (innerError) {
      // Silently handle error - use default values
      shopInfo = null
    }
    if (shopInfo) {
      return res.status(200).json(shopInfo)
    }
    return res.status(200).json({
      shopName: 'Bedtex',
      shopEmail: 'support@bedtex.com',
      shopPhone: '+880 1234567890',
      shopAddress: 'Dhaka, Bangladesh',
      shopDescription: '',
      shopLogo: '',
    })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching shop info', error: error.message })
  }
}

export const updateShopInfo = async (req, res) => {
  try {
    const shopInfo = req.body

    await setSetting('shop_info', shopInfo)
    res.status(200).json({ message: 'Shop info updated successfully', shopInfo })
  } catch (error) {
    console.error('Error in updateShopInfo:', error)
    res.status(500).json({ message: 'Error updating shop info', error: error.message })
  }
}

// Theme settings
export const getTheme = async (req, res) => {
  try {
    const theme = await getSetting('theme_settings')
    if (theme) return res.status(200).json(theme)
    return res.status(200).json({
      primaryColor: '#2563eb',
      secondaryColor: '#06b6d4',
      backgroundColor: '#ffffff',
      textColor: '#0f172a',
      fontFamily: 'Inter',
    })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching theme', error: error.message })
  }
}

export const updateTheme = async (req, res) => {
  try {
    const { primaryColor, secondaryColor, backgroundColor, textColor, fontFamily } = req.body
    const theme = { primaryColor, secondaryColor, backgroundColor, textColor, fontFamily }
    await setSetting('theme_settings', theme)
    res.status(200).json({ message: 'Theme updated successfully', theme })
  } catch (error) {
    res.status(500).json({ message: 'Error updating theme', error: error.message })
  }
}

// Hero Slides Endpoints
export const getHeroSlides = async (req, res) => {
  try {
    const query = 'SELECT * FROM hero_slides WHERE is_active = true ORDER BY display_order ASC'
    const result = await db.query(query)
    res.status(200).json({ slides: result.rows })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching hero slides', error: error.message })
  }
}

export const createHeroSlide = async (req, res) => {
  try {
    const { title, subtitle, description, image, cta, url } = req.body

    if (!title || !image) {
      return res.status(400).json({ message: 'Title and image are required' })
    }

    const query = `
      INSERT INTO hero_slides (title, subtitle, description, image, cta, url, display_order)
      VALUES ($1, $2, $3, $4, $5, $6, (SELECT COUNT(*) FROM hero_slides))
      RETURNING id
    `
    const result = await db.query(query, [title, subtitle, description, image, cta, url])

    res.status(201).json({ message: 'Slide created successfully', slideId: result.rows[0].id })
  } catch (error) {
    res.status(500).json({ message: 'Error creating hero slide', error: error.message })
  }
}

export const updateHeroSlide = async (req, res) => {
  try {
    const { id } = req.params
    const { title, subtitle, description, image, cta, url, display_order } = req.body

    if (!title || !image) {
      return res.status(400).json({ message: 'Title and image are required' })
    }

    const query = `
      UPDATE hero_slides
      SET title = $1, subtitle = $2, description = $3, image = $4, cta = $5, url = $6, display_order = COALESCE($7, display_order)
      WHERE id = $8
    `
    await db.query(query, [title, subtitle, description, image, cta, url, display_order, id])

    res.status(200).json({ message: 'Slide updated successfully' })
  } catch (error) {
    res.status(500).json({ message: 'Error updating hero slide', error: error.message })
  }
}

export const deleteHeroSlide = async (req, res) => {
  try {
    const { id } = req.params

    const query = 'DELETE FROM hero_slides WHERE id = $1'
    await db.query(query, [id])

    res.status(200).json({ message: 'Slide deleted successfully' })
  } catch (error) {
    res.status(500).json({ message: 'Error deleting hero slide', error: error.message })
  }
}

// Featured Products Endpoints
export const getFeaturedProducts = async (req, res) => {
  try {
    const query = `
      SELECT p.*, fp.display_order FROM products p
      INNER JOIN featured_products fp ON p.id = fp.product_id
      WHERE fp.is_active = true
      ORDER BY fp.display_order ASC
    `
    const result = await db.query(query)
    res.status(200).json({ products: result.rows })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching featured products', error: error.message })
  }
}

export const addFeaturedProduct = async (req, res) => {
  try {
    const { productId } = req.body

    if (!productId) {
      return res.status(400).json({ message: 'Product ID is required' })
    }

    const query = `
      INSERT INTO featured_products (product_id, display_order)
      VALUES ($1, (SELECT COUNT(*) FROM featured_products))
    `
    await db.query(query, [productId])

    res.status(201).json({ message: 'Product added to featured list' })
  } catch (error) {
    res.status(500).json({ message: 'Error adding featured product', error: error.message })
  }
}

export const removeFeaturedProduct = async (req, res) => {
  try {
    const { productId } = req.params

    const query = 'DELETE FROM featured_products WHERE product_id = $1'
    await db.query(query, [productId])

    res.status(200).json({ message: 'Product removed from featured list' })
  } catch (error) {
    res.status(500).json({ message: 'Error removing featured product', error: error.message })
  }
}

// Update order of featured products
export const updateFeaturedOrder = async (req, res) => {
  const client = await db.connect()
  try {
    const { order } = req.body
    if (!Array.isArray(order)) {
      return res.status(400).json({ message: 'Order must be an array' })
    }

    await client.query('BEGIN')
    for (const item of order) {
      const { productId, display_order } = item
      await client.query('UPDATE featured_products SET display_order = $1 WHERE product_id = $2', [
        display_order,
        productId,
      ])
    }
    await client.query('COMMIT')
    res.status(200).json({ message: 'Featured products order updated' })
  } catch (error) {
    await client.query('ROLLBACK')
    res.status(500).json({ message: 'Error updating featured order', error: error.message })
  } finally {
    client.release()
  }
}

// ============ NEW SETTINGS ENDPOINTS ============

// Hero Settings
export const getHeroSettings = async (req, res) => {
  try {
    const settings = await getSetting('hero_settings')
    if (settings) return res.status(200).json(settings)
    return res.status(200).json({
      autoplay: true,
      autoplaySpeed: 5,
      transition: 'fade',
      showArrows: true,
      showDots: true,
      loop: true,
    })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching hero settings', error: error.message })
  }
}

export const updateHeroSettings = async (req, res) => {
  try {
    const settings = req.body
    await setSetting('hero_settings', settings)
    res.status(200).json({ message: 'Hero settings updated', settings })
  } catch (error) {
    res.status(500).json({ message: 'Error updating hero settings', error: error.message })
  }
}

// Featured Settings
export const getFeaturedSettings = async (req, res) => {
  try {
    const settings = await getSetting('featured_settings')
    if (settings) return res.status(200).json(settings)
    return res.status(200).json({
      productsToShow: 8,
      layoutStyle: 'grid',
      showBadges: true,
      sortOrder: 'manual',
    })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching featured settings', error: error.message })
  }
}

export const updateFeaturedSettings = async (req, res) => {
  try {
    const settings = req.body
    await setSetting('featured_settings', settings)
    res.status(200).json({ message: 'Featured settings updated', settings })
  } catch (error) {
    res.status(500).json({ message: 'Error updating featured settings', error: error.message })
  }
}

// Homepage Sections
export const getHomeSections = async (req, res) => {
  try {
    const sections = await getSetting('home_sections')
    if (sections) return res.status(200).json(sections)
    return res.status(200).json({
      categories: {
        enabled: true,
        title: 'Shop by Category',
        count: 6,
        layout: 'grid',
        showCount: true,
      },
      flashSale: { enabled: true, title: 'Flash Sale', endDate: '', products: [] },
      newArrivals: { enabled: true, title: 'New Arrivals', count: 8, daysNew: 30 },
      bestSellers: { enabled: true, title: 'Best Sellers', count: 8, period: '30' },
      testimonials: { enabled: true, title: 'Customer Reviews', count: 6, autoFetch: false },
      newsletter: { enabled: true, title: 'Subscribe', description: '', buttonText: 'Subscribe' },
      brands: { enabled: false, title: 'Our Partners', layout: 'carousel', grayscale: true },
      whyChoose: { enabled: false, title: 'Why Choose Us' },
      instagram: { enabled: false, title: 'Follow Us', username: '', posts: 6 },
      blog: { enabled: false, title: 'Latest News', posts: 3, layout: 'grid' },
    })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching home sections', error: error.message })
  }
}

export const updateHomeSections = async (req, res) => {
  try {
    const { sections, order } = req.body
    await setSetting('home_sections', sections)
    await setSetting('home_sections_order', order)
    res.status(200).json({ message: 'Homepage sections updated' })
  } catch (error) {
    res.status(500).json({ message: 'Error updating home sections', error: error.message })
  }
}

// Categories and Subcategories (stored in settings as a JSON array)
export const getCategories = async (req, res) => {
  try {
    const categories = await getSetting('categories')
    return res.status(200).json(categories || [])
  } catch (error) {
    res.status(500).json({ message: 'Error fetching categories', error: error.message })
  }
}

export const updateCategories = async (req, res) => {
  try {
    const categories = req.body
    if (!Array.isArray(categories)) {
      console.error('Invalid categories data - not an array:', typeof categories, categories)
      return res.status(400).json({ message: 'Categories must be an array' })
    }

    // Validate and sanitize categories data
    const validatedCategories = categories.map((cat) => ({
      id: cat.id,
      name: cat.name || '',
      slug: cat.slug || '',
      description: cat.description || '',
      image: cat.image || '',
      isVisible: cat.isVisible !== undefined ? cat.isVisible : true,
      order: cat.order || 0,
      subcategories: Array.isArray(cat.subcategories) ? cat.subcategories : [],
    }))

    console.log('Attempting to save categories:', {
      count: validatedCategories.length,
      firstItem: validatedCategories[0],
    })

    await setSetting('categories', validatedCategories)

    // 🔌 Emit real-time update via Socket.io
    const io = req.app.get('io')
    if (io) {
      io.emit('categories:updated', {
        timestamp: new Date().toISOString(),
        categories: validatedCategories,
        updatedBy: req.user?.id || 'system',
      })
      console.log('📢 [Socket.io] Broadcasted category update to all connected clients')
    }

    res.status(200).json({ message: 'Categories updated', categories: validatedCategories })
  } catch (error) {
    console.error('Error updating categories:', {
      message: error.message,
      stack: error.stack,
      body: req.body,
    })
    res.status(500).json({
      message: 'Error updating categories',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    })
  }
}

// Navigation Menus
export const getMenus = async (req, res) => {
  try {
    const menus = await getSetting('navigation_menus')
    if (menus) return res.status(200).json(menus)
    return res.status(200).json({ headerMenu: [], footerMenus: {} })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching menus', error: error.message })
  }
}

export const updateMenus = async (req, res) => {
  try {
    const { headerMenu, footerMenus } = req.body
    await setSetting('navigation_menus', { headerMenu, footerMenus })
    res.status(200).json({ message: 'Menus updated' })
  } catch (error) {
    res.status(500).json({ message: 'Error updating menus', error: error.message })
  }
}

// Theme Customization (Enhanced)
export const updateThemeCustomization = async (req, res) => {
  try {
    const {
      colors,
      typography,
      layout,
      headerSettings,
      footerSettings,
      productPageSettings,
      shopPageSettings,
    } = req.body
    const theme = {
      colors,
      typography,
      layout,
      headerSettings,
      footerSettings,
      productPageSettings,
      shopPageSettings,
    }
    await setSetting('theme_customization', theme)
    res.status(200).json({ message: 'Theme customization saved', theme })
  } catch (error) {
    res.status(500).json({ message: 'Error updating theme', error: error.message })
  }
}

export const getThemeCustomization = async (req, res) => {
  try {
    const theme = await getSetting('theme_customization')
    if (theme) return res.status(200).json(theme)
    return res.status(200).json({
      colors: {
        primary: '#2563eb',
        secondary: '#06b6d4',
        accent: '#f59e0b',
        text: '#0f172a',
        heading: '#1e293b',
        background: '#ffffff',
        headerBg: '#ffffff',
        footerBg: '#1e293b',
        buttonPrimary: '#2563eb',
        buttonHover: '#1d4ed8',
        link: '#2563eb',
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444',
        saleBadge: '#ef4444',
        newBadge: '#10b981',
      },
      typography: {
        headingFont: 'Poppins',
        bodyFont: 'Inter',
        fontScale: 'medium',
        h1Size: '2.5rem',
        h2Size: '2rem',
        h3Size: '1.5rem',
        h4Size: '1.25rem',
        bodySize: '1rem',
        lineHeight: '1.5',
        fontWeight: '400',
      },
      layout: {
        containerWidth: '1200px',
        sidebarPosition: 'right',
        productCardStyle: 'style1',
        borderRadius: 'slightly-rounded',
        boxShadow: 'light',
      },
    })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching theme customization', error: error.message })
  }
}

// Shipping & Delivery
export const getShipping = async (req, res) => {
  try {
    const shipping = await getSetting('shipping_settings')
    if (shipping) return res.status(200).json(shipping)
    return res.status(200).json({
      zones: [],
      methods: [],
      deliverySettings: {
        processingTime: '1-3 days',
        standardDelivery: '5-7 days',
        expressDelivery: '2-3 days',
        orderCutoff: '14:00',
      },
      packagingOptions: {
        giftWrap: true,
        giftWrapCost: 0,
        giftMessage: true,
        boxSizes: [],
      },
    })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching shipping settings', error: error.message })
  }
}

export const updateShipping = async (req, res) => {
  try {
    const { zones, methods, deliverySettings, packagingOptions } = req.body
    const shipping = { zones, methods, deliverySettings, packagingOptions }
    await setSetting('shipping_settings', shipping)
    res.status(200).json({ message: 'Shipping settings updated' })
  } catch (error) {
    res.status(500).json({ message: 'Error updating shipping settings', error: error.message })
  }
}

// Image Upload Endpoint (Backend authenticated Cloudinary upload)
export const uploadImage = async (req, res) => {
  try {
    console.log('[uploadImage] ====== REQUEST RECEIVED ======')
    console.log('[uploadImage] req.files type:', typeof req.files)
    console.log('[uploadImage] req.files value:', req.files)
    console.log('[uploadImage] req.files keys:', req.files ? Object.keys(req.files) : 'UNDEFINED')
    console.log('[uploadImage] req.body:', req.body)
    console.log('[uploadImage] req.headers:', {
      contentType: req.headers['content-type'],
      authorization: !!req.headers.authorization,
    })

    // Check if file exists
    if (!req.files || !req.files.file) {
      console.error('[uploadImage] ❌ NO FILE PROVIDED')
      console.error('[uploadImage] req.files undefined?', !req.files)
      console.error('[uploadImage] req.files.file undefined?', req.files && !req.files.file)
      if (req.files) {
        console.error('[uploadImage] Available fields in req.files:', Object.keys(req.files))
      }
      return res.status(400).json({
        message: 'No file provided',
        debug: {
          hasReqFiles: !!req.files,
          hasReqFilesFile: req.files ? !!req.files.file : false,
          availableFields: req.files ? Object.keys(req.files) : [],
        },
      })
    }

    const file = req.files.file
    console.log('[uploadImage] File received:', {
      name: file.name,
      mimetype: file.mimetype,
      size: file.size,
      hasData: !!file.data,
      dataLength: file.data ? file.data.length : 0,
      hasTempFilePath: !!file.tempFilePath,
      tempFilePath: file.tempFilePath,
    })

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    const maxSize = 5 * 1024 * 1024 // 5MB

    // Validate file is not empty
    if (!file.tempFilePath) {
      console.error('[uploadImage] ❌ No temp file path - file:', {
        name: file.name,
        size: file.size,
        hasData: !!file.data,
      })
      return res.status(400).json({
        message: 'File upload failed - no temporary file created',
      })
    }

    if (file.size <= 0) {
      console.error('[uploadImage] File size is 0')
      return res.status(400).json({
        message: 'File is empty',
      })
    }

    // Validate file type
    if (!allowedTypes.includes(file.mimetype)) {
      console.error('[uploadImage] Invalid file type:', file.mimetype)
      return res.status(400).json({
        message: 'Invalid file type. Allowed: JPG, PNG, GIF, WebP',
      })
    }

    // Validate file size
    if (file.size > maxSize) {
      console.error('[uploadImage] File too large:', file.size)
      return res.status(400).json({
        message: 'File size exceeds 5MB limit',
      })
    }

    console.log('[uploadImage] ✅ All validations passed, uploading to Cloudinary...')
    console.log('[uploadImage] Using tempFilePath:', file.tempFilePath)

    // Upload to Cloudinary using tempFilePath (like productController does)
    // This is more reliable than using buffer directly
    const result = await cloudinary.uploader.upload(file.tempFilePath, {
      folder: 'bedtex/categories',
      resource_type: 'auto',
      overwrite: false,
      use_filename: false,
      unique_filename: true,
    })

    console.log('[uploadImage] ✅ Cloudinary upload successful:', {
      publicId: result.public_id,
      url: result.secure_url,
      size: result.bytes,
      width: result.width,
      height: result.height,
    })

    res.status(200).json({
      message: 'Image uploaded successfully',
      secure_url: result.secure_url,
      public_id: result.public_id,
      width: result.width,
      height: result.height,
    })
  } catch (error) {
    console.error('[uploadImage] Error uploading image:', {
      message: error.message,
      code: error.http_code,
      status: error.status,
      stack: error.stack,
    })

    res.status(500).json({
      message: 'Error uploading image',
      error: error.message,
    })
  }
}
