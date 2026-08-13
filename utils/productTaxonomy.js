/**
 * Resolve subcategory name + id for product writes.
 * category_id on subcategories table is the settings category id (TEXT).
 */
import database from '../database/db.js'

export async function resolveSubcategoryFields(subcategoryId, categoryName) {
  if (!subcategoryId) {
    return { subcategory_id: null, subcategory: null }
  }

  const { rows } = await database.query(
    `SELECT id, name, category_id FROM subcategories WHERE id = $1::uuid AND is_active = true`,
    [subcategoryId],
  )
  if (!rows[0]) {
    const err = new Error('Invalid or inactive subcategory')
    err.statusCode = 400
    throw err
  }

  return {
    subcategory_id: rows[0].id,
    subcategory: rows[0].name,
    // Caller may still send category name from UI; keep as provided
    categoryHint: categoryName || null,
  }
}
