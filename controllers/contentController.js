import database from '../database/db.js'
import { catchAsyncErrors } from '../utils/catchAsyncErrors.js'
import { getSetting } from '../models/settingsTable.js'

// ============================================
// PAGE MANAGEMENT
// ============================================
export const getPages = catchAsyncErrors(async (req, res, next) => {
  const { rows: pages } = await database.query(
    `SELECT * FROM pages ORDER BY position ASC, created_at DESC`,
  )
  res.status(200).json({
    success: true,
    data: pages,
  })
})

export const createPage = catchAsyncErrors(async (req, res, next) => {
  const {
    title,
    slug,
    content,
    description,
    keywords,
    image_url,
    is_published,
    template,
    custom_css,
    custom_js,
    position,
  } = req.body

  const { rows } = await database.query(
    `INSERT INTO pages
    (title, slug, content, description, keywords, image_url, is_published, template, custom_css, custom_js, position, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
    RETURNING *`,
    [
      title,
      slug,
      content,
      description,
      keywords,
      image_url,
      is_published,
      template,
      custom_css,
      custom_js,
      position,
    ],
  )

  res.status(201).json({
    success: true,
    data: rows[0],
  })
})

export const updatePage = catchAsyncErrors(async (req, res, next) => {
  const { pageId } = req.params
  const {
    title,
    slug,
    content,
    description,
    keywords,
    image_url,
    is_published,
    template,
    custom_css,
    custom_js,
    position,
  } = req.body

  const { rows } = await database.query(
    `UPDATE pages
    SET title = $1, slug = $2, content = $3, description = $4, keywords = $5, image_url = $6, is_published = $7, template = $8, custom_css = $9, custom_js = $10, position = $11, updated_at = NOW()
    WHERE id = $12
    RETURNING *`,
    [
      title,
      slug,
      content,
      description,
      keywords,
      image_url,
      is_published,
      template,
      custom_css,
      custom_js,
      position,
      pageId,
    ],
  )

  res.status(200).json({
    success: true,
    data: rows[0],
  })
})

export const deletePage = catchAsyncErrors(async (req, res, next) => {
  const { pageId } = req.params

  await database.query(`DELETE FROM pages WHERE id = $1`, [pageId])

  res.status(200).json({
    success: true,
    message: 'Page deleted successfully',
  })
})

// ============================================
// SECTION MANAGEMENT
// ============================================
export const getSections = catchAsyncErrors(async (req, res, next) => {
  const { rows: sections } = await database.query(
    `SELECT * FROM homepage_sections ORDER BY position ASC, created_at DESC`,
  )
  res.status(200).json({
    success: true,
    data: sections,
  })
})

export const createSection = catchAsyncErrors(async (req, res, next) => {
  const {
    title,
    section_type,
    content,
    position,
    is_visible,
    styling,
    animation,
    background_image,
    background_color,
  } = req.body

  const { rows } = await database.query(
    `INSERT INTO homepage_sections
    (title, section_type, content, position, is_visible, styling, animation, background_image, background_color, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
    RETURNING *`,
    [
      title,
      section_type,
      content,
      position,
      is_visible,
      styling,
      animation,
      background_image,
      background_color,
    ],
  )

  res.status(201).json({
    success: true,
    data: rows[0],
  })
})

export const updateSection = catchAsyncErrors(async (req, res, next) => {
  const { sectionId } = req.params
  const {
    title,
    section_type,
    content,
    position,
    is_visible,
    styling,
    animation,
    background_image,
    background_color,
  } = req.body

  const { rows } = await database.query(
    `UPDATE homepage_sections
    SET title = $1, section_type = $2, content = $3, position = $4, is_visible = $5, styling = $6, animation = $7, background_image = $8, background_color = $9, updated_at = NOW()
    WHERE id = $10
    RETURNING *`,
    [
      title,
      section_type,
      content,
      position,
      is_visible,
      styling,
      animation,
      background_image,
      background_color,
      sectionId,
    ],
  )

  res.status(200).json({
    success: true,
    data: rows[0],
  })
})

export const deleteSection = catchAsyncErrors(async (req, res, next) => {
  const { sectionId } = req.params

  await database.query(`DELETE FROM homepage_sections WHERE id = $1`, [sectionId])

  res.status(200).json({
    success: true,
    message: 'Section deleted successfully',
  })
})

export const reorderSections = catchAsyncErrors(async (req, res, next) => {
  const { sections } = req.body

  for (let i = 0; i < sections.length; i++) {
    await database.query(`UPDATE homepage_sections SET position = $1 WHERE id = $2`, [
      i,
      sections[i].id,
    ])
  }

  res.status(200).json({
    success: true,
    message: 'Sections reordered successfully',
  })
})

// ============================================
// NAVIGATION MENU MANAGEMENT
// ============================================
export const getMenuItems = catchAsyncErrors(async (req, res, next) => {
  const { rows: menuItems } = await database.query(
    `SELECT * FROM menu_items ORDER BY position ASC, created_at DESC`,
  )
  res.status(200).json({
    success: true,
    data: menuItems,
  })
})

export const createMenuItem = catchAsyncErrors(async (req, res, next) => {
  const { label, url, icon, position, parent_id, is_visible, target } = req.body

  const { rows } = await database.query(
    `INSERT INTO menu_items
    (label, url, icon, position, parent_id, is_visible, target, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
    RETURNING *`,
    [label, url, icon, position, parent_id, is_visible, target],
  )

  res.status(201).json({
    success: true,
    data: rows[0],
  })
})

export const updateMenuItem = catchAsyncErrors(async (req, res, next) => {
  const { menuItemId } = req.params
  const { label, url, icon, position, parent_id, is_visible, target } = req.body

  const { rows } = await database.query(
    `UPDATE menu_items
    SET label = $1, url = $2, icon = $3, position = $4, parent_id = $5, is_visible = $6, target = $7, updated_at = NOW()
    WHERE id = $8
    RETURNING *`,
    [label, url, icon, position, parent_id, is_visible, target, menuItemId],
  )

  res.status(200).json({
    success: true,
    data: rows[0],
  })
})

export const deleteMenuItem = catchAsyncErrors(async (req, res, next) => {
  const { menuItemId } = req.params

  await database.query(`DELETE FROM menu_items WHERE id = $1 OR parent_id = $1`, [menuItemId])

  res.status(200).json({
    success: true,
    message: 'Menu item deleted successfully',
  })
})

// ============================================
// EMAIL TEMPLATES
// ============================================
export const getEmailTemplates = catchAsyncErrors(async (req, res, next) => {
  const { rows: templates } = await database.query(
    `SELECT * FROM email_templates ORDER BY created_at DESC`,
  )
  res.status(200).json({
    success: true,
    data: templates,
  })
})

export const getEmailTemplate = catchAsyncErrors(async (req, res, next) => {
  const { templateId } = req.params

  const { rows } = await database.query(`SELECT * FROM email_templates WHERE id = $1`, [templateId])

  res.status(200).json({
    success: true,
    data: rows[0],
  })
})

export const updateEmailTemplate = catchAsyncErrors(async (req, res, next) => {
  const { templateId } = req.params
  const { subject, body, variables, is_active } = req.body

  const { rows } = await database.query(
    `UPDATE email_templates
    SET subject = $1, body = $2, variables = $3, is_active = $4, updated_at = NOW()
    WHERE id = $5
    RETURNING *`,
    [subject, body, variables, is_active, templateId],
  )

  res.status(200).json({
    success: true,
    data: rows[0],
  })
})

// ============================================
// NOTIFICATION SETTINGS
// ============================================
export const getNotificationSettings = catchAsyncErrors(async (req, res, next) => {
  const { rows } = await database.query(`SELECT * FROM notification_settings`)
  res.status(200).json({
    success: true,
    data: rows[0],
  })
})

export const updateNotificationSettings = catchAsyncErrors(async (req, res, next) => {
  const {
    email_on_order,
    email_on_delivery,
    sms_on_order,
    push_on_order,
    admin_email_on_order,
    slack_notification,
    webhook_url,
  } = req.body

  const { rows } = await database.query(
    `UPDATE notification_settings
    SET email_on_order = $1, email_on_delivery = $2, sms_on_order = $3, push_on_order = $4,
        admin_email_on_order = $5, slack_notification = $6, webhook_url = $7, updated_at = NOW()
    RETURNING *`,
    [
      email_on_order,
      email_on_delivery,
      sms_on_order,
      push_on_order,
      admin_email_on_order,
      slack_notification,
      webhook_url,
    ],
  )

  res.status(200).json({
    success: true,
    data: rows[0],
  })
})

// ============================================
// SEO & METADATA
// ============================================
export const getSeoSettings = catchAsyncErrors(async (req, res, next) => {
  const { rows } = await database.query(`SELECT * FROM seo_settings`)
  res.status(200).json({
    success: true,
    data: rows[0],
  })
})

export const updateSeoSettings = catchAsyncErrors(async (req, res, next) => {
  const {
    meta_title,
    meta_description,
    meta_keywords,
    og_image,
    og_title,
    og_description,
    robots_txt,
    sitemap_enabled,
  } = req.body

  const { rows } = await database.query(
    `UPDATE seo_settings
    SET meta_title = $1, meta_description = $2, meta_keywords = $3, og_image = $4,
        og_title = $5, og_description = $6, robots_txt = $7, sitemap_enabled = $8, updated_at = NOW()
    RETURNING *`,
    [
      meta_title,
      meta_description,
      meta_keywords,
      og_image,
      og_title,
      og_description,
      robots_txt,
      sitemap_enabled,
    ],
  )

  res.status(200).json({
    success: true,
    data: rows[0],
  })
})

// ============================================
// FRONTEND COMPONENTS CONTROL
// ============================================
export const getComponentSettings = catchAsyncErrors(async (req, res, next) => {
  const { rows } = await database.query(`SELECT * FROM component_settings`)
  res.status(200).json({
    success: true,
    data: rows,
  })
})

export const updateComponentSetting = catchAsyncErrors(async (req, res, next) => {
  const { componentId } = req.params
  const { is_visible, display_name, position, custom_props } = req.body

  const { rows } = await database.query(
    `UPDATE component_settings
    SET is_visible = $1, display_name = $2, position = $3, custom_props = $4, updated_at = NOW()
    WHERE id = $5
    RETURNING *`,
    [is_visible, display_name, position, custom_props, componentId],
  )

  res.status(200).json({
    success: true,
    data: rows[0],
  })
})

// ============================================
// FOOTER CONTENT CONTROL
// ============================================
export const getFooterContent = catchAsyncErrors(async (req, res, next) => {
  const { rows } = await database.query(`SELECT * FROM footer_content`)
  res.status(200).json({
    success: true,
    data: rows[0],
  })
})

export const updateFooterContent = catchAsyncErrors(async (req, res, next) => {
  const {
    company_name,
    company_description,
    contact_email,
    contact_phone,
    address,
    social_links,
    footer_links,
    copyright_text,
    payment_methods,
  } = req.body

  const { rows } = await database.query(
    `UPDATE footer_content
    SET company_name = $1, company_description = $2, contact_email = $3, contact_phone = $4,
        address = $5, social_links = $6, footer_links = $7, copyright_text = $8, payment_methods = $9, updated_at = NOW()
    RETURNING *`,
    [
      company_name,
      company_description,
      contact_email,
      contact_phone,
      address,
      social_links,
      footer_links,
      copyright_text,
      payment_methods,
    ],
  )

  res.status(200).json({
    success: true,
    data: rows[0],
  })
})

// ============================================
// BANNER & PROMOTIONAL CONTENT
// ============================================
export const getBanners = catchAsyncErrors(async (req, res, next) => {
  const { rows: banners } = await database.query(
    `SELECT * FROM promotional_banners ORDER BY position ASC, created_at DESC`,
  )
  res.status(200).json({
    success: true,
    data: banners,
  })
})

export const createBanner = catchAsyncErrors(async (req, res, next) => {
  const { title, image_url, link, position, is_active, start_date, end_date, target_audience } =
    req.body

  const { rows } = await database.query(
    `INSERT INTO promotional_banners
    (title, image_url, link, position, is_active, start_date, end_date, target_audience, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
    RETURNING *`,
    [title, image_url, link, position, is_active, start_date, end_date, target_audience],
  )

  res.status(201).json({
    success: true,
    data: rows[0],
  })
})

export const updateBanner = catchAsyncErrors(async (req, res, next) => {
  const { bannerId } = req.params
  const { title, image_url, link, position, is_active, start_date, end_date, target_audience } =
    req.body

  const { rows } = await database.query(
    `UPDATE promotional_banners
    SET title = $1, image_url = $2, link = $3, position = $4, is_active = $5, start_date = $6, end_date = $7, target_audience = $8, updated_at = NOW()
    WHERE id = $9
    RETURNING *`,
    [title, image_url, link, position, is_active, start_date, end_date, target_audience, bannerId],
  )

  res.status(200).json({
    success: true,
    data: rows[0],
  })
})

export const deleteBanner = catchAsyncErrors(async (req, res, next) => {
  const { bannerId } = req.params

  await database.query(`DELETE FROM promotional_banners WHERE id = $1`, [bannerId])

  res.status(200).json({
    success: true,
    message: 'Banner deleted successfully',
  })
})

// ============================================
// GLOBAL CONTENT CONTROL
// ============================================
export const getGlobalSettings = catchAsyncErrors(async (req, res, next) => {
  const { rows } = await database.query(`SELECT * FROM global_settings`)
  res.status(200).json({
    success: true,
    data: rows[0] || {},
  })
})

export const updateGlobalSettings = catchAsyncErrors(async (req, res, next) => {
  const {
    site_name,
    site_logo,
    site_favicon,
    primary_color,
    secondary_color,
    accent_color,
    font_family,
    timezone,
    language,
    maintenance_mode,
    maintenance_message,
  } = req.body

  // Check if record exists
  const { rows: existingSettings } = await database.query(`SELECT * FROM global_settings LIMIT 1`)

  let result
  if (existingSettings.length > 0) {
    const { rows } = await database.query(
      `UPDATE global_settings
      SET site_name = $1, site_logo = $2, site_favicon = $3, primary_color = $4, secondary_color = $5,
          accent_color = $6, font_family = $7, timezone = $8, language = $9, maintenance_mode = $10,
          maintenance_message = $11, updated_at = NOW()
      RETURNING *`,
      [
        site_name,
        site_logo,
        site_favicon,
        primary_color,
        secondary_color,
        accent_color,
        font_family,
        timezone,
        language,
        maintenance_mode,
        maintenance_message,
      ],
    )
    result = rows[0]
  } else {
    const { rows } = await database.query(
      `INSERT INTO global_settings
      (site_name, site_logo, site_favicon, primary_color, secondary_color, accent_color, font_family, timezone, language, maintenance_mode, maintenance_message, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      RETURNING *`,
      [
        site_name,
        site_logo,
        site_favicon,
        primary_color,
        secondary_color,
        accent_color,
        font_family,
        timezone,
        language,
        maintenance_mode,
        maintenance_message,
      ],
    )
    result = rows[0]
  }

  if (req.io) {
    req.io.emit('settings:updated', { type: 'global_settings' })
    req.io.emit('content:updated', { type: 'global_settings' })
  }

  res.status(200).json({
    success: true,
    data: result,
  })
})

// ============================================
// CATEGORIES (Public - for frontend)
// ============================================
export const getCategories = catchAsyncErrors(async (req, res, next) => {
  const categories = await getSetting('categories')
  res.status(200).json(categories || [])
})

const safeQuery = async (sql, params = []) => {
  try {
    return await database.query(sql, params)
  } catch {
    return { rows: [] }
  }
}

const safeSetting = async (key) => {
  try {
    return await getSetting(key)
  } catch {
    return null
  }
}

/**
 * Public bootstrap for the storefront — shop, hero, footer, menus, CMS pages, home sections.
 */
export const getStorefrontConfig = catchAsyncErrors(async (req, res) => {
  const [
    globalRes,
    footerRes,
    bannersRes,
    pagesRes,
    menusRes,
    heroRes,
    shopInfo,
    homeSections,
    navMenus,
    shipping,
  ] = await Promise.all([
    safeQuery(`SELECT * FROM global_settings LIMIT 1`),
    safeQuery(`SELECT * FROM footer_content LIMIT 1`),
    safeQuery(
      `SELECT * FROM promotional_banners WHERE COALESCE(is_active, true) = true ORDER BY position ASC, created_at DESC`,
    ),
    safeQuery(
      `SELECT slug, title, description, content, image_url FROM pages WHERE COALESCE(is_published, true) = true ORDER BY position ASC`,
    ),
    safeQuery(
      `SELECT id, label, url, icon, position, parent_id, target FROM menu_items WHERE COALESCE(is_visible, true) = true ORDER BY position ASC`,
    ),
    safeQuery(
      `SELECT * FROM hero_slides WHERE COALESCE(is_active, true) = true ORDER BY display_order ASC NULLS LAST`,
    ),
    safeSetting('shop_info'),
    safeSetting('home_sections'),
    safeSetting('navigation_menus'),
    safeSetting('shipping_settings'),
  ])

  const global = globalRes.rows[0] || {}
  let footer = footerRes.rows[0] || null
  const shop = shopInfo && typeof shopInfo === 'object' ? shopInfo : {}

  // Merge shop_info social/copyright into footer when footer fields are empty
  const shopSocial = {
    facebook: shop.facebookUrl || '',
    instagram: shop.instagramUrl || '',
    twitter: shop.twitterUrl || '',
    youtube: shop.youtubeUrl || '',
    linkedin: shop.linkedinUrl || '',
  }
  const hasShopSocial = Object.values(shopSocial).some(Boolean)
  if (footer) {
    const footerSocialEmpty =
      !footer.social_links ||
      (typeof footer.social_links === 'object' &&
        !Object.values(footer.social_links).some((v) => v && v !== '#'))
    footer = {
      ...footer,
      company_name: footer.company_name || shop.shopName || null,
      contact_email: footer.contact_email || shop.shopEmail || null,
      contact_phone: footer.contact_phone || shop.shopPhone || null,
      address: footer.address || shop.shopAddress || null,
      company_description: footer.company_description || shop.shopDescription || null,
      copyright_text: footer.copyright_text || shop.copyrightText || null,
      social_links: footerSocialEmpty && hasShopSocial ? shopSocial : footer.social_links,
    }
  } else if (hasShopSocial || shop.copyrightText) {
    footer = {
      company_name: shop.shopName || null,
      company_description: shop.shopDescription || null,
      contact_email: shop.shopEmail || null,
      contact_phone: shop.shopPhone || null,
      address: shop.shopAddress || null,
      social_links: shopSocial,
      copyright_text: shop.copyrightText || null,
    }
  }

  res.status(200).json({
    success: true,
    data: {
      shop: {
        shopName: shop.shopName || shop.name || global.site_name || null,
        email: shop.shopEmail || shop.email || footer?.contact_email || global.email || null,
        phone: shop.shopPhone || shop.phone || footer?.contact_phone || global.phone || null,
        address: shop.shopAddress || shop.address || footer?.address || global.address || null,
        description:
          shop.shopDescription ||
          shop.description ||
          footer?.company_description ||
          global.description ||
          null,
        tagline: shop.shopTagline || shop.tagline || shop.shopDescription || null,
        logo: shop.shopLogo || shop.logo || global.site_logo || null,
        favicon: shop.shopFavicon || shop.favicon || global.site_favicon || null,
        currency: shop.currency || shipping?.pricing?.currency || global.currency || 'BDT',
        timezone: shop.timezone || global.timezone || 'Asia/Dhaka',
        whatsapp: shop.whatsapp || shop.whatsappNumber || null,
        facebookUrl: shop.facebookUrl || null,
        instagramUrl: shop.instagramUrl || null,
        twitterUrl: shop.twitterUrl || null,
        youtubeUrl: shop.youtubeUrl || null,
        linkedinUrl: shop.linkedinUrl || null,
        copyrightText: shop.copyrightText || null,
      },
      global,
      footer,
      banners: bannersRes.rows,
      heroSlides: heroRes.rows,
      pages: pagesRes.rows,
      menus: menusRes.rows,
      headerMenu: navMenus?.headerMenu || menusRes.rows,
      footerMenus: navMenus?.footerMenus || footer?.footer_links || null,
      homeSections: homeSections || null,
      shipping: shipping || null,
    },
  })
})

export const getPublicPage = catchAsyncErrors(async (req, res, next) => {
  const slug = String(req.params.slug || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
  const { rows } = await safeQuery(
    `SELECT slug, title, description, content, image_url, keywords
     FROM pages WHERE slug = $1 AND COALESCE(is_published, true) = true LIMIT 1`,
    [slug],
  )
  if (!rows[0]) {
    return res.status(404).json({ success: false, message: 'Page not found' })
  }
  res.status(200).json({ success: true, data: rows[0] })
})

export const submitContactInquiry = catchAsyncErrors(async (req, res) => {
  const { name, email, subject, message } = req.body || {}
  if (!name || !email || !message) {
    return res.status(400).json({ success: false, message: 'Name, email, and message are required.' })
  }
  await database.query(`
    CREATE TABLE IF NOT EXISTS contact_inquiries (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      subject VARCHAR(500),
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `)
  await database.query(
    `INSERT INTO contact_inquiries (name, email, subject, message) VALUES ($1, $2, $3, $4)`,
    [String(name).slice(0, 255), String(email).slice(0, 255), String(subject || '').slice(0, 500), String(message).slice(0, 8000)],
  )
  res.status(201).json({ success: true, message: 'Message received.' })
})

export const subscribeNewsletter = catchAsyncErrors(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  if (!email || !email.includes('@')) {
    return res.status(400).json({ success: false, message: 'Valid email required.' })
  }
  await database.query(`
    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `)
  await database.query(
    `INSERT INTO newsletter_subscribers (email) VALUES ($1) ON CONFLICT (email) DO NOTHING`,
    [email],
  )
  res.status(200).json({ success: true, message: 'Subscribed.' })
})

