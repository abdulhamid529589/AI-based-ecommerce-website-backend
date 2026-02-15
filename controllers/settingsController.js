import db from '../database/db.js'
import { getSetting, setSetting } from '../models/settingsTable.js'

// Shop Info Endpoints
export const getShopInfo = async (req, res) => {
  try {
    console.log('GET /product/settings/shop-info called')
    let shopInfo = null
    try {
      shopInfo = await getSetting('shop_info')
    } catch (innerError) {
      console.error('Error while reading shop_info from DB:', innerError)
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
    const { shopName, shopEmail, shopPhone, shopAddress, shopDescription, shopLogo } = req.body

    const shopInfo = {
      shopName,
      shopEmail,
      shopPhone,
      shopAddress,
      shopDescription,
      shopLogo,
    }

    await setSetting('shop_info', shopInfo)
    res.status(200).json({ message: 'Shop info updated successfully', shopInfo })
  } catch (error) {
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
