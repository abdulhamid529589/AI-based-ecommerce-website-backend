/**
 * Input Validation Middleware
 * Validates request bodies against predefined schemas
 */

const schemas = {
  createProduct: {
    name: { required: true, type: 'string', min: 3, max: 200 },
    description: { required: true, type: 'string', min: 10, max: 2000 },
    price: { required: true, type: 'number', min: 0 },
    stock: { required: true, type: 'number', min: 0, isInteger: true },
    category: { required: true, type: 'string', min: 1 },
    images: { required: false, type: 'array' },
  },

  updateProduct: {
    name: { required: false, type: 'string', min: 3, max: 200 },
    description: { required: false, type: 'string', max: 2000 },
    price: { required: false, type: 'number', min: 0 },
    stock: { required: false, type: 'number', min: 0, isInteger: true },
    category: { required: false, type: 'string', min: 2, max: 50 },
  },

  updateOrderStatus: {
    order_status: {
      required: true,
      type: 'string',
      enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
    },
  },

  createOrder: {
    items: { required: true, type: 'array', minLength: 1 },
    shippingAddress: { required: true, type: 'string', min: 5, max: 500 },
    paymentMethod: { required: true, type: 'string', enum: ['card', 'bank', 'wallet'] },
  },

  customerProfile: {
    name: { required: false, type: 'string', min: 2, max: 100 },
    email: { required: false, type: 'email' },
    phone: { required: false, type: 'string', min: 10, max: 15 },
  },

  postReview: {
    rating: { required: true, type: 'number', min: 1, max: 5, isInteger: true },
    title: { required: false, type: 'string', min: 5, max: 100 },
    comment: { required: false, type: 'string', min: 10, max: 500 },
  },
}

/**
 * Validate single field against schema
 */
function validateField(value, fieldName, fieldSchema) {
  // Check required
  if (fieldSchema.required && (value === undefined || value === null || value === '')) {
    return `${fieldName} is required`
  }

  // Skip validation if not required and not provided
  if (!fieldSchema.required && (value === undefined || value === null)) {
    return null
  }

  // Check type
  if (fieldSchema.type === 'email') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(value)) {
      return `${fieldName} must be a valid email address`
    }
  } else if (fieldSchema.type === 'number') {
    // Handle form data where numbers come as strings
    if (typeof value === 'string') {
      const numValue = parseFloat(value)
      if (isNaN(numValue)) {
        return `${fieldName} must be a valid number`
      }
      // Update value for further checks
      value = numValue
    } else if (typeof value !== 'number') {
      return `${fieldName} must be of type number`
    }
  } else if (typeof value !== fieldSchema.type) {
    return `${fieldName} must be of type ${fieldSchema.type}`
  }

  // Check min/max length for strings
  if (fieldSchema.type === 'string') {
    if (fieldSchema.min && value.length < fieldSchema.min) {
      return `${fieldName} must be at least ${fieldSchema.min} characters`
    }
    if (fieldSchema.max && value.length > fieldSchema.max) {
      return `${fieldName} must be at most ${fieldSchema.max} characters`
    }
  }

  // Check min/max for numbers
  if (fieldSchema.type === 'number') {
    // Convert string to number for comparison if needed
    let numValue = typeof value === 'string' ? parseFloat(value) : value
    if (fieldSchema.min !== undefined && numValue < fieldSchema.min) {
      return `${fieldName} must be at least ${fieldSchema.min}`
    }
    if (fieldSchema.max !== undefined && numValue > fieldSchema.max) {
      return `${fieldName} must be at most ${fieldSchema.max}`
    }
  }

  // Check integer
  if (fieldSchema.isInteger) {
    let numValue = typeof value === 'string' ? parseFloat(value) : value
    if (!Number.isInteger(numValue)) {
      return `${fieldName} must be an integer`
    }
  }

  // Check enum
  if (fieldSchema.enum && !fieldSchema.enum.includes(value)) {
    return `${fieldName} must be one of: ${fieldSchema.enum.join(', ')}`
  }

  // Check array
  if (fieldSchema.type === 'array') {
    if (!Array.isArray(value)) {
      return `${fieldName} must be an array`
    }
    if (fieldSchema.minLength && value.length < fieldSchema.minLength) {
      return `${fieldName} must have at least ${fieldSchema.minLength} item(s)`
    }
  }

  return null
}

/**
 * Validate entire request against schema
 */
function validate(data, schema) {
  const errors = {}

  for (const [fieldName, fieldSchema] of Object.entries(schema)) {
    const error = validateField(data[fieldName], fieldName, fieldSchema)
    if (error) {
      errors[fieldName] = error
    }
  }

  return Object.keys(errors).length > 0 ? errors : null
}

/**
 * Middleware factory for validation
 */
export function validateRequest(schemaName) {
  return (req, res, next) => {
    const schema = schemas[schemaName]

    if (!schema) {
      return next() // Schema not found, skip validation
    }

    const errors = validate(req.body, schema)

    if (errors) {
      return res.status(422).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        errors,
        timestamp: new Date().toISOString(),
      })
    }

    next()
  }
}

/**
 * Direct validation function for use in controllers
 */
export function validateData(data, schemaName) {
  const schema = schemas[schemaName]

  if (!schema) {
    throw new Error(`Schema '${schemaName}' not found`)
  }

  const errors = validate(data, schema)
  return { isValid: !errors, errors }
}

/**
 * Export all schemas for reference
 */
export { schemas }
