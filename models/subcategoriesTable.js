import database from '../database/db.js'
import { getSetting } from './settingsTable.js'

/**
 * Create subcategories table for managing nested category structure
 * Supports one level of nesting (Categories -> Subcategories)
 */
export const createSubcategoriesTable = async () => {
  try {
    await database.query(`
      CREATE TABLE IF NOT EXISTS subcategories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category_id TEXT NOT NULL,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL,
        description TEXT,
        icon VARCHAR(100),
        image_url VARCHAR(500),
        position INT DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(category_id, slug)
      )
    `)
    console.log('✓ Subcategories table created successfully')

    // Create index for faster queries
    await database.query(
      `CREATE INDEX IF NOT EXISTS idx_subcategories_category_id ON subcategories(category_id)`,
    )
    console.log('✓ Subcategories index created successfully')
  } catch (error) {
    if (error.code !== '42P07') {
      console.error('Error creating subcategories table:', error.message)
    }
  }
}

/**
 * Get all subcategories for a category
 */
export const getSubcategoriesByCategory = async (categoryId) => {
  const { rows } = await database.query(
    `SELECT * FROM subcategories WHERE category_id = $1 AND is_active = true ORDER BY position ASC, created_at DESC`,
    [categoryId],
  )
  return rows
}

/**
 * Get a single subcategory
 */
export const getSubcategoryById = async (subcategoryId) => {
  const { rows } = await database.query(`SELECT * FROM subcategories WHERE id = $1::uuid`, [
    subcategoryId,
  ])
  return rows[0] || null
}

/**
 * Create a new subcategory
 */
export const createSubcategory = async (categoryId, data) => {
  const { name, slug, description, icon, image_url, position, is_active } = data

  const { rows } = await database.query(
    `INSERT INTO subcategories (category_id, name, slug, description, icon, image_url, position, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
     RETURNING *`,
    [
      categoryId,
      name,
      slug,
      description || null,
      icon || null,
      image_url || null,
      position || 0,
      is_active !== false,
    ],
  )
  return rows[0]
}

/**
 * Update a subcategory
 */
export const updateSubcategory = async (subcategoryId, data) => {
  const { name, slug, description, icon, image_url, position, is_active } = data

  const { rows } = await database.query(
    `UPDATE subcategories
     SET name = $1, slug = $2, description = $3, icon = $4, image_url = $5, position = $6, is_active = $7, updated_at = NOW()
     WHERE id = $8::uuid
     RETURNING *`,
    [
      name,
      slug,
      description || null,
      icon || null,
      image_url || null,
      position || 0,
      is_active !== false,
      subcategoryId,
    ],
  )
  return rows[0]
}

/**
 * Delete a subcategory
 */
export const deleteSubcategory = async (subcategoryId) => {
  if (!subcategoryId || subcategoryId.trim() === '') {
    console.error('❌ [deleteSubcategory] Invalid subcategoryId:', subcategoryId)
    return null
  }

  console.log('🗑️ [deleteSubcategory Model] Deleting subcategory with ID:', subcategoryId)

  try {
    const { rows } = await database.query(
      `DELETE FROM subcategories WHERE id = $1::uuid RETURNING *`,
      [subcategoryId],
    )

    if (rows.length === 0) {
      console.warn('⚠️ [deleteSubcategory] No subcategory found with ID:', subcategoryId)
      return null
    }

    console.log('✅ [deleteSubcategory] Successfully deleted subcategory:', rows[0].id)
    return rows[0]
  } catch (error) {
    console.error('❌ [deleteSubcategory] Error deleting subcategory:', {
      subcategoryId,
      errorMessage: error.message,
      errorCode: error.code,
    })
    throw error
  }
}

/**
 * Get categories with their subcategories
 * Categories come from settings (JSON), subcategories from database
 */
export const getCategoriesWithSubcategories = async () => {
  try {
    const categories = await getSetting('categories')

    if (!Array.isArray(categories)) {
      return []
    }

    // For each category, fetch its subcategories from the database
    const categoriesWithSubs = await Promise.all(
      categories.map(async (category) => {
        const { rows: subcategories } = await database.query(
          `SELECT id, name, slug, description, icon, image_url, position, is_active
           FROM subcategories
           WHERE category_id = $1 AND is_active = true
           ORDER BY position ASC, created_at DESC`,
          [category.id],
        )

        return {
          id: category.id,
          name: category.name,
          slug: category.slug,
          description: category.description || '',
          image: category.image || '',
          isVisible: category.isVisible !== undefined ? category.isVisible : true,
          order: category.order || 0,
          subcategories: subcategories || [],
        }
      }),
    )

    return categoriesWithSubs
  } catch (error) {
    console.error('Error fetching categories with subcategories:', error)
    return []
  }
}

/**
 * Reorder subcategories
 */
export const reorderSubcategories = async (subcategoryId, newPosition) => {
  const { rows } = await database.query(
    `UPDATE subcategories SET position = $1, updated_at = NOW() WHERE id = $2::uuid RETURNING *`,
    [newPosition, subcategoryId],
  )
  return rows[0]
}
