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
  updateNotificationPreferences,
} from '../controllers/authController.js'
import {
  createAddress,
  getAddresses,
  getAddressById,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} from '../controllers/addressController.js'
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
router.put('/user/notification-preferences', isAuthenticated, updateNotificationPreferences)

// Address management endpoints
router.post('/addresses', isAuthenticated, createAddress)
router.get('/addresses', isAuthenticated, getAddresses)
router.get('/addresses/:addressId', isAuthenticated, getAddressById)
router.put('/addresses/:addressId', isAuthenticated, updateAddress)
router.delete('/addresses/:addressId', isAuthenticated, deleteAddress)
router.put('/addresses/:addressId/set-default', isAuthenticated, setDefaultAddress)

export default router
