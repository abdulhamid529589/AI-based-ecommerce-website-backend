import express from 'express'
import {
  forgotPassword,
  getUser,
  login,
  logout,
  register,
  resetPassword,
  updatePassword,
  updateProfile,
  refreshAccessToken,
} from '../controllers/authController.js'
import { isAuthenticated } from '../middlewares/authMiddleware.js'

const router = express.Router()

router.post('/register', register)
router.post('/login', login)
router.get('/me', isAuthenticated, getUser)
router.get('/logout', isAuthenticated, logout)
router.post('/refresh-token', refreshAccessToken)
router.post('/password/forgot', forgotPassword)
router.put('/password/reset/:token', resetPassword)
router.put('/password/update', isAuthenticated, updatePassword)
router.put('/profile/update', isAuthenticated, updateProfile)

// Additional user profile aliases for frontend compatibility
router.put('/user/update-profile', isAuthenticated, updateProfile)
router.post('/user/update-avatar', isAuthenticated, updateProfile)
router.post('/user/change-password', isAuthenticated, updatePassword)
router.put('/user/notification-preferences', isAuthenticated, (req, res) => {
  // Placeholder for notification preferences endpoint
  // Currently just returns success - can be extended with database storage later
  res.status(200).json({
    success: true,
    message: 'Notification preferences updated successfully.',
  })
})

export default router
