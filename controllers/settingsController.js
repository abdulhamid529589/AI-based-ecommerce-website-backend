import db from '../database/db.js'
import { getSetting, setSetting } from '../models/settingsTable.js'

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
      return res.status(400).json({ message: 'Categories must be an array' })
    }
    await setSetting('categories', categories)
    res.status(200).json({ message: 'Categories updated', categories })
  } catch (error) {
    res.status(500).json({ message: 'Error updating categories', error: error.message })
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
