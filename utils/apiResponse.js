/**
 * Standardized API Response Format Utility
 * Ensures all API endpoints return consistent response structure
 */

export class APIResponse {
  constructor(success, message, data = null, meta = null) {
    this.success = success
    this.message = message
    this.data = data
    if (meta) this.meta = meta
    this.timestamp = new Date().toISOString()
  }

  static success(message, data = null, meta = null) {
    return new APIResponse(true, message, data, meta)
  }

  static error(message, data = null, meta = null) {
    return new APIResponse(false, message, data, meta)
  }

  static paginated(message, data, page, limit, total) {
    return new APIResponse(true, message, data, {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1,
    })
  }
}

/**
 * Standard response middleware
 * Wraps all responses to ensure consistency
 */
export const responseMiddleware = (req, res, next) => {
  // Override res.json to ensure consistent format
  const originalJson = res.json.bind(res)

  res.json = function (data) {
    if (data && !data.success && !data.message) {
      // If it's an error object without our format
      return originalJson({
        success: false,
        message: data.message || 'An error occurred',
        errors: data.errors || null,
        timestamp: new Date().toISOString(),
      })
    }
    return originalJson(data)
  }

  next()
}

/**
 * Standardize pagination response
 */
export const formatPaginatedResponse = (items, page, limit, total) => {
  return {
    success: true,
    data: items,
    meta: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: parseInt(total),
      totalPages: Math.ceil(total / limit),
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1,
    },
  }
}

/**
 * Standardize list response
 */
export const formatListResponse = (
  items,
  total = null,
  message = 'Items retrieved successfully',
) => {
  return {
    success: true,
    message,
    data: items,
    meta: total !== null ? { total: parseInt(total) } : undefined,
  }
}

/**
 * Standardize single item response
 */
export const formatItemResponse = (item, message = 'Item retrieved successfully') => {
  return {
    success: true,
    message,
    data: item,
  }
}

/**
 * Standardize creation response
 */
export const formatCreatedResponse = (item, message = 'Item created successfully') => {
  return {
    success: true,
    message,
    data: item,
    statusCode: 201,
  }
}

/**
 * Standardize update response
 */
export const formatUpdatedResponse = (item, message = 'Item updated successfully') => {
  return {
    success: true,
    message,
    data: item,
  }
}

/**
 * Standardize delete response
 */
export const formatDeletedResponse = (message = 'Item deleted successfully') => {
  return {
    success: true,
    message,
    data: null,
  }
}

/**
 * Standardize error response
 */
export const formatErrorResponse = (message, statusCode = 400, errors = null) => {
  return {
    success: false,
    message,
    errors,
    statusCode,
    timestamp: new Date().toISOString(),
  }
}

export default APIResponse
