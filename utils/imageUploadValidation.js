export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/**
 * Validate an express-fileupload file object.
 * Returns error message string or null if valid.
 */
export function validateImageUpload(file) {
  if (!file) {
    return 'No file provided'
  }
  if (!file.tempFilePath) {
    return 'File upload failed — no temporary file'
  }
  if (!file.size || file.size <= 0) {
    return 'File is empty'
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    return 'Invalid file type. Allowed: JPG, PNG, GIF, WebP'
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return 'File size exceeds 5MB limit'
  }
  return null
}

export default validateImageUpload
