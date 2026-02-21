import database from '../database/db.js'

export const createPagesTable = async () => {
  try {
    await database.query(`
      CREATE TABLE IF NOT EXISTS pages (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        content TEXT,
        description TEXT,
        keywords TEXT,
        image_url VARCHAR(500),
        is_published BOOLEAN DEFAULT false,
        template VARCHAR(100),
        custom_css TEXT,
        custom_js TEXT,
        position INT DEFAULT 0,
        views INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `)
    console.log('✓ Pages table created successfully')
  } catch (error) {
    if (error.code !== '42P07') {
      console.error('Error creating pages table:', error.message)
    }
  }
}

export const createHomepageSectionsTable = async () => {
  try {
    await database.query(`
      CREATE TABLE IF NOT EXISTS homepage_sections (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        section_type VARCHAR(100) NOT NULL,
        content JSONB,
        position INT DEFAULT 0,
        is_visible BOOLEAN DEFAULT true,
        styling JSONB,
        animation VARCHAR(100),
        background_image VARCHAR(500),
        background_color VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `)
    console.log('✓ Homepage sections table created successfully')
  } catch (error) {
    if (error.code !== '42P07') {
      console.error('Error creating homepage sections table:', error.message)
    }
  }
}

export const createMenuItemsTable = async () => {
  try {
    await database.query(`
      CREATE TABLE IF NOT EXISTS menu_items (
        id SERIAL PRIMARY KEY,
        label VARCHAR(255) NOT NULL,
        url VARCHAR(500),
        icon VARCHAR(100),
        position INT DEFAULT 0,
        parent_id INT,
        is_visible BOOLEAN DEFAULT true,
        target VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (parent_id) REFERENCES menu_items(id) ON DELETE CASCADE
      )
    `)
    console.log('✓ Menu items table created successfully')
  } catch (error) {
    if (error.code !== '42P07') {
      console.error('Error creating menu items table:', error.message)
    }
  }
}

export const createEmailTemplatesTable = async () => {
  try {
    await database.query(`
      CREATE TABLE IF NOT EXISTS email_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        subject VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        variables JSONB,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `)
    // Insert default email templates
    await database.query(`
      INSERT INTO email_templates (name, subject, body, variables, is_active)
      VALUES
        ('order_confirmation', 'Order Confirmation - {{order_id}}', 'Dear {{customer_name}},\n\nYour order {{order_id}} has been confirmed.\n\nOrder Details:\n{{order_items}}\n\nTotal: {{total_amount}}\n\nThank you for your purchase!', '["customer_name", "order_id", "order_items", "total_amount"]', true),
        ('order_shipped', 'Your Order Has Been Shipped!', 'Dear {{customer_name}},\n\nYour order {{order_id}} has been shipped.\n\nTracking Number: {{tracking_number}}\n\nTrack your package: {{tracking_url}}', '["customer_name", "order_id", "tracking_number", "tracking_url"]', true),
        ('password_reset', 'Reset Your Password', 'Dear {{customer_name}},\n\nClick the link below to reset your password:\n\n{{reset_link}}\n\nThis link expires in 24 hours.', '["customer_name", "reset_link"]', true),
        ('welcome_email', 'Welcome to Our Store!', 'Dear {{customer_name}},\n\nWelcome to our store! We are excited to have you.\n\nGet {{welcome_discount}}% off your first order using code: {{discount_code}}', '["customer_name", "welcome_discount", "discount_code"]', true),
        ('promotional', 'Special Offer for You!', 'Dear {{customer_name}},\n\nWe have a special offer just for you!\n\n{{promotion_details}}\n\nShop Now: {{shop_link}}', '["customer_name", "promotion_details", "shop_link"]', true)
      ON CONFLICT DO NOTHING
    `)
    console.log('✓ Email templates table created successfully with default templates')
  } catch (error) {
    if (error.code !== '42P07') {
      console.error('Error creating email templates table:', error.message)
    }
  }
}

export const createNotificationSettingsTable = async () => {
  try {
    await database.query(`
      CREATE TABLE IF NOT EXISTS notification_settings (
        id SERIAL PRIMARY KEY,
        email_on_order BOOLEAN DEFAULT true,
        email_on_delivery BOOLEAN DEFAULT true,
        sms_on_order BOOLEAN DEFAULT false,
        push_on_order BOOLEAN DEFAULT true,
        admin_email_on_order BOOLEAN DEFAULT true,
        slack_notification BOOLEAN DEFAULT false,
        webhook_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `)
    // Insert default notification settings
    await database.query(`
      INSERT INTO notification_settings (email_on_order, email_on_delivery, sms_on_order, push_on_order, admin_email_on_order)
      VALUES (true, true, false, true, true)
      ON CONFLICT DO NOTHING
    `)
    console.log('✓ Notification settings table created successfully')
  } catch (error) {
    if (error.code !== '42P07') {
      console.error('Error creating notification settings table:', error.message)
    }
  }
}

export const createSeoSettingsTable = async () => {
  try {
    await database.query(`
      CREATE TABLE IF NOT EXISTS seo_settings (
        id SERIAL PRIMARY KEY,
        meta_title VARCHAR(255),
        meta_description VARCHAR(500),
        meta_keywords VARCHAR(500),
        og_image VARCHAR(500),
        og_title VARCHAR(255),
        og_description VARCHAR(500),
        robots_txt TEXT,
        sitemap_enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `)
    console.log('✓ SEO settings table created successfully')
  } catch (error) {
    if (error.code !== '42P07') {
      console.error('Error creating SEO settings table:', error.message)
    }
  }
}

export const createComponentSettingsTable = async () => {
  try {
    await database.query(`
      CREATE TABLE IF NOT EXISTS component_settings (
        id SERIAL PRIMARY KEY,
        component_name VARCHAR(255) UNIQUE NOT NULL,
        display_name VARCHAR(255),
        is_visible BOOLEAN DEFAULT true,
        position INT DEFAULT 0,
        custom_props JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `)
    console.log('✓ Component settings table created successfully')
  } catch (error) {
    if (error.code !== '42P07') {
      console.error('Error creating component settings table:', error.message)
    }
  }
}

export const createFooterContentTable = async () => {
  try {
    await database.query(`
      CREATE TABLE IF NOT EXISTS footer_content (
        id SERIAL PRIMARY KEY,
        company_name VARCHAR(255),
        company_description TEXT,
        contact_email VARCHAR(255),
        contact_phone VARCHAR(20),
        address TEXT,
        social_links JSONB,
        footer_links JSONB,
        copyright_text VARCHAR(500),
        payment_methods JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `)
    console.log('✓ Footer content table created successfully')
  } catch (error) {
    if (error.code !== '42P07') {
      console.error('Error creating footer content table:', error.message)
    }
  }
}

export const createPromotionalBannersTable = async () => {
  try {
    await database.query(`
      CREATE TABLE IF NOT EXISTS promotional_banners (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        image_url VARCHAR(500) NOT NULL,
        link VARCHAR(500),
        position INT DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        start_date TIMESTAMP,
        end_date TIMESTAMP,
        target_audience VARCHAR(255),
        clicks INT DEFAULT 0,
        impressions INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `)
    console.log('✓ Promotional banners table created successfully')
  } catch (error) {
    if (error.code !== '42P07') {
      console.error('Error creating promotional banners table:', error.message)
    }
  }
}

export const createGlobalSettingsTable = async () => {
  try {
    await database.query(`
      CREATE TABLE IF NOT EXISTS global_settings (
        id SERIAL PRIMARY KEY,
        site_name VARCHAR(255),
        site_logo VARCHAR(500),
        site_favicon VARCHAR(500),
        primary_color VARCHAR(50) DEFAULT '#3B82F6',
        secondary_color VARCHAR(50) DEFAULT '#1F2937',
        accent_color VARCHAR(50) DEFAULT '#F59E0B',
        font_family VARCHAR(100) DEFAULT 'Inter, system-ui, sans-serif',
        timezone VARCHAR(50) DEFAULT 'UTC',
        language VARCHAR(10) DEFAULT 'en',
        maintenance_mode BOOLEAN DEFAULT false,
        maintenance_message TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `)
    console.log('✓ Global settings table created successfully')
  } catch (error) {
    if (error.code !== '42P07') {
      console.error('Error creating global settings table:', error.message)
    }
  }
}
