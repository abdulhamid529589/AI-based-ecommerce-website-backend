import fs from 'fs'
import path from 'path'

/**
 * Delete temporary file from uploads folder after successful Cloudinary upload
 * @param {string} tempFilePath - The full path to the temporary file
 * @returns {Promise<boolean>} - Returns true if deleted or file doesn't exist, false if error
 */
export const deleteTempFile = async (tempFilePath) => {
  try {
    if (!tempFilePath) {
      return true // No file to delete
    }

    // Check if file exists before attempting deletion
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath)
      console.log(`[FileCleanup] ✅ Temporary file deleted: ${tempFilePath}`)
      return true
    } else {
      console.log(`[FileCleanup] ℹ️  File not found (already deleted): ${tempFilePath}`)
      return true
    }
  } catch (error) {
    console.error(`[FileCleanup] ❌ Error deleting temporary file: ${tempFilePath}`, {
      message: error.message,
      code: error.code,
    })
    // Don't throw error - log it but continue execution
    // The Cloudinary upload was already successful
    return false
  }
}

/**
 * Delete multiple temporary files
 * @param {Array<string>} tempFilePaths - Array of file paths to delete
 * @returns {Promise<void>}
 */
export const deleteTempFiles = async (tempFilePaths) => {
  try {
    if (!Array.isArray(tempFilePaths)) {
      return
    }

    for (const tempFilePath of tempFilePaths) {
      await deleteTempFile(tempFilePath)
    }
  } catch (error) {
    console.error('[FileCleanup] Error deleting multiple temporary files:', error.message)
  }
}

/**
 * Clean up all files in uploads directory (optional - for maintenance)
 * @param {string} uploadsDir - Path to uploads directory
 * @returns {Promise<number>} - Number of files deleted
 */
export const cleanupUploadsDirectory = async (uploadsDir = 'server/uploads') => {
  try {
    let filesDeleted = 0

    if (!fs.existsSync(uploadsDir)) {
      console.log(`[FileCleanup] Uploads directory does not exist: ${uploadsDir}`)
      return 0
    }

    const files = fs.readdirSync(uploadsDir)

    for (const file of files) {
      const filePath = path.join(uploadsDir, file)
      const stat = fs.statSync(filePath)

      if (stat.isFile()) {
        fs.unlinkSync(filePath)
        filesDeleted++
        console.log(`[FileCleanup] Deleted: ${file}`)
      }
    }

    console.log(`[FileCleanup] ✅ Cleanup complete: ${filesDeleted} files deleted`)
    return filesDeleted
  } catch (error) {
    console.error('[FileCleanup] Error cleaning uploads directory:', error.message)
    return 0
  }
}
