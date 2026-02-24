import { catchAsyncErrors } from '../utils/catchAsyncErrors.js'
import {
  getSubcategoriesByCategory,
  getSubcategoryById,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
  getCategoriesWithSubcategories,
  reorderSubcategories,
} from '../models/subcategoriesTable.js'

/**
 * Get all subcategories for a specific category
 */
export const getSubcategoriesByCategory_Controller = catchAsyncErrors(async (req, res, next) => {
  const { categoryId } = req.params

  const subcategories = await getSubcategoriesByCategory(categoryId)

  res.status(200).json({
    success: true,
    data: subcategories,
  })
})

/**
 * Create a new subcategory
 */
export const createSubcategory_Controller = catchAsyncErrors(async (req, res, next) => {
  const { categoryId } = req.params
  const { name, slug, description, icon, image_url, position, is_active } = req.body

  if (!name) {
    return res.status(400).json({
      success: false,
      message: 'Subcategory name is required',
    })
  }

  const subcategory = await createSubcategory(categoryId, {
    name,
    slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
    description,
    icon,
    image_url,
    position,
    is_active,
  })

  // Broadcast real-time update to all connected clients
  const io = req.app.get('io')
  if (io) {
    const allCategories = await getCategoriesWithSubcategories()
    io.emit('subcategories:created', { action: 'created', subcategory })
    io.emit('categories:updated', { categories: allCategories })
  }

  res.status(201).json({
    success: true,
    data: subcategory,
  })
})

/**
 * Update a subcategory
 */
export const updateSubcategory_Controller = catchAsyncErrors(async (req, res, next) => {
  const { subcategoryId } = req.params
  const { name, slug, description, icon, image_url, position, is_active } = req.body

  const subcategory = await updateSubcategory(subcategoryId, {
    name,
    slug,
    description,
    icon,
    image_url,
    position,
    is_active,
  })

  // Broadcast real-time update
  const io = req.app.get('io')
  if (io) {
    const allCategories = await getCategoriesWithSubcategories()
    io.emit('subcategories:updated', { action: 'updated', subcategory })
    io.emit('categories:updated', { categories: allCategories })
  }

  res.status(200).json({
    success: true,
    data: subcategory,
  })
})

/**
 * Delete a subcategory
 */
export const deleteSubcategory_Controller = catchAsyncErrors(async (req, res, next) => {
  const { subcategoryId } = req.params

  console.log('🗑️ [SubcategoryController] Delete request for subcategoryId:', subcategoryId)

  if (!subcategoryId || subcategoryId.trim() === '') {
    console.error('❌ [SubcategoryController] Invalid subcategoryId provided')
    return res.status(400).json({
      success: false,
      message: 'Invalid subcategory ID',
    })
  }

  try {
    const subcategory = await deleteSubcategory(subcategoryId)

    if (!subcategory) {
      console.warn('⚠️ [SubcategoryController] Subcategory not found:', subcategoryId)
      return res.status(404).json({
        success: false,
        message: 'Subcategory not found',
      })
    }

    console.log('✅ [SubcategoryController] Subcategory deleted:', subcategory.id)

    // Broadcast real-time update
    const io = req.app.get('io')
    if (io) {
      const allCategories = await getCategoriesWithSubcategories()
      io.emit('subcategories:deleted', { action: 'deleted', subcategory })
      io.emit('categories:updated', { categories: allCategories })
    }

    res.status(200).json({
      success: true,
      message: 'Subcategory deleted successfully',
      data: subcategory,
    })
  } catch (error) {
    console.error('❌ [SubcategoryController] Error in deleteSubcategory_Controller:', {
      subcategoryId,
      error: error.message,
      code: error.code,
    })

    // Let catchAsyncErrors handle the error response
    throw error
  }
})

/**
 * Reorder subcategories
 */
export const reorderSubcategories_Controller = catchAsyncErrors(async (req, res, next) => {
  const { subcategoryId } = req.params
  const { position } = req.body

  const subcategory = await reorderSubcategories(subcategoryId, position)

  // Broadcast real-time update
  const io = req.app.get('io')
  if (io) {
    const allCategories = await getCategoriesWithSubcategories()
    io.emit('subcategories:reordered', { action: 'reordered', subcategory })
    io.emit('categories:updated', { categories: allCategories })
  }

  res.status(200).json({
    success: true,
    data: subcategory,
  })
})

/**
 * Get all categories with their subcategories (for frontend)
 */
export const getCategoriesWithSubcategories_Controller = catchAsyncErrors(
  async (req, res, next) => {
    const categories = await getCategoriesWithSubcategories()

    res.status(200).json({
      success: true,
      data: categories,
    })
  },
)
