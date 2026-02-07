import ErrorHandler from '../middlewares/errorMiddleware.js'
import { catchAsyncErrors } from '../middlewares/catchAsyncError.js'
import database from '../database/db.js'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { sendToken } from '../utils/jwtToken.js'
import { generateResetPasswordToken } from '../utils/generateResetPasswordToken.js'
import { generateEmailTemplate } from '../utils/generateForgotPasswordEmailTemplate.js'
import { sendEmail } from '../utils/sendEmail.js'
import crypto from 'crypto'
import { v2 as cloudinary } from 'cloudinary'

export const register = catchAsyncErrors(async (req, res, next) => {
  const { name, email, mobile, password, role } = req.body

  // Validate inputs
  if (!name || !password) {
    return next(new ErrorHandler('Please provide name and password.', 400))
  }

  if (!email && !mobile) {
    return next(new ErrorHandler('Please provide either email or mobile number.', 400))
  }

  if (password.length < 8 || password.length > 16) {
    return next(new ErrorHandler('Password must be between 8 and 16 characters.', 400))
  }

  // Validate mobile format if provided (Bangladeshi format)
  if (mobile) {
    // Remove all non-digit characters to validate
    const digitsOnly = mobile.replace(/\D/g, '')

    // Bangladesh mobile: 10-11 digits (01XXXXXXXXX) or +880 format
    // Accepted formats:
    // - Local: 01XXXXXXXXX (11 digits)
    // - International: +8801XXXXXXXXX (13 digits including +88)
    if (
      !(
        (digitsOnly.length === 11 && digitsOnly.startsWith('1')) ||
        (digitsOnly.length === 13 && digitsOnly.startsWith('880'))
      )
    ) {
      return next(
        new ErrorHandler(
          'Please provide a valid Bangladesh mobile number (+880 1XX XXX XXXX or 01XXXXXXXXX).',
          400,
        ),
      )
    }

    // Normalize to international format for storage
    const normalizedMobile = digitsOnly.startsWith('880')
      ? '+' + digitsOnly
      : '+880' + digitsOnly.slice(1)

    // Check if mobile already exists
    const mobileExists = await database.query(`SELECT * FROM users WHERE mobile = $1`, [
      normalizedMobile,
    ])
    if (mobileExists.rows.length > 0) {
      return next(new ErrorHandler('User already registered with this mobile number.', 400))
    }

    mobile = normalizedMobile
  }

  const hashedPassword = await bcrypt.hash(password, 10)
  const userRole = role === 'Admin' ? 'Admin' : 'User'

  const user = await database.query(
    'INSERT INTO users (name, email, mobile, password, role) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [name, email || null, mobile || null, hashedPassword, userRole],
  )
  sendToken(user.rows[0], 201, 'User registered successfully', res)
})

export const login = catchAsyncErrors(async (req, res, next) => {
  const { email, mobile, password } = req.body

  if (!password) {
    return next(new ErrorHandler('Please provide password.', 400))
  }

  if (!email && !mobile) {
    return next(new ErrorHandler('Please provide email or mobile number.', 400))
  }

  let user
  let queryMobile = mobile

  if (email) {
    user = await database.query(`SELECT * FROM users WHERE email = $1`, [email])
  } else if (mobile) {
    // Normalize Bangladesh mobile number for login
    const digitsOnly = mobile.replace(/\D/g, '')

    // Normalize to international format to match database storage
    const normalizedMobile = digitsOnly.startsWith('880')
      ? '+' + digitsOnly
      : '+880' + digitsOnly.slice(1)

    queryMobile = normalizedMobile
    user = await database.query(`SELECT * FROM users WHERE mobile = $1`, [normalizedMobile])
  }

  if (user.rows.length === 0) {
    return next(new ErrorHandler('Invalid email/mobile or password.', 401))
  }

  const isPasswordMatch = await bcrypt.compare(password, user.rows[0].password)
  if (!isPasswordMatch) {
    return next(new ErrorHandler('Invalid email/mobile or password.', 401))
  }
  sendToken(user.rows[0], 200, 'Logged In.', res)
})

export const getUser = catchAsyncErrors(async (req, res, next) => {
  const { user } = req
  res.status(200).json({
    success: true,
    user,
  })
})

export const logout = catchAsyncErrors(async (req, res, next) => {
  res
    .status(200)
    .cookie('accessToken', '', {
      expires: new Date(Date.now()),
      httpOnly: true,
    })
    .cookie('refreshToken', '', {
      expires: new Date(Date.now()),
      httpOnly: true,
    })
    .json({
      success: true,
      message: 'Logged out successfully.',
    })
})

export const refreshAccessToken = catchAsyncErrors(async (req, res, next) => {
  const refreshToken = req.cookies.refreshToken || req.body.refreshToken

  if (!refreshToken) {
    return next(new ErrorHandler('Refresh token not found.', 401))
  }

  try {
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET_KEY,
    )

    const user = await database.query(`SELECT * FROM users WHERE id = $1`, [decoded.id])

    if (user.rows.length === 0) {
      return next(new ErrorHandler('User not found.', 404))
    }

    // Generate new access token
    const accessToken = jwt.sign({ id: user.rows[0].id }, process.env.JWT_SECRET_KEY, {
      expiresIn: '1h',
    })

    res
      .status(200)
      .cookie('accessToken', accessToken, {
        expires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        httpOnly: true,
      })
      .json({
        success: true,
        accessToken,
        message: 'Access token refreshed successfully.',
      })
  } catch (error) {
    return next(new ErrorHandler('Invalid refresh token.', 401))
  }
})

export const forgotPassword = catchAsyncErrors(async (req, res, next) => {
  const { email } = req.body
  const { frontendUrl } = req.query
  let userResult = await database.query(`SELECT * FROM users WHERE email = $1`, [email])
  if (userResult.rows.length === 0) {
    return next(new ErrorHandler('User not found with this email.', 404))
  }
  const user = userResult.rows[0]
  const { hashedToken, resetPasswordExpireTime, resetToken } = generateResetPasswordToken()

  await database.query(
    `UPDATE users SET reset_password_token = $1, reset_password_expire = to_timestamp($2) WHERE email = $3`,
    [hashedToken, resetPasswordExpireTime / 1000, email],
  )

  const resetPasswordUrl = `${frontendUrl}/password/reset/${resetToken}`

  const message = generateEmailTemplate(resetPasswordUrl)

  try {
    await sendEmail({
      email: user.email,
      subject: 'Ecommerce Password Recovery',
      message,
    })
    res.status(200).json({
      success: true,
      message: `Email sent to ${user.email} successfully.`,
    })
  } catch (error) {
    await database.query(
      `UPDATE users SET reset_password_token = NULL, reset_password_expire = NULL WHERE email = $1`,
      [email],
    )
    return next(new ErrorHandler('Email could not be sent.', 500))
  }
})

export const resetPassword = catchAsyncErrors(async (req, res, next) => {
  const { token } = req.params
  const resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex')
  const user = await database.query(
    'SELECT * FROM users WHERE reset_password_token = $1 AND reset_password_expire > NOW()',
    [resetPasswordToken],
  )
  if (user.rows.length === 0) {
    return next(new ErrorHandler('Invalid or expired reset token.', 400))
  }
  if (req.body.password !== req.body.confirmPassword) {
    return next(new ErrorHandler('Passwords do not match.', 400))
  }
  if (
    req.body.password?.length < 8 ||
    req.body.password?.length > 16 ||
    req.body.confirmPassword?.length < 8 ||
    req.body.confirmPassword?.length > 16
  ) {
    return next(new ErrorHandler('Password must be between 8 and 16 characters.', 400))
  }
  const hashedPassword = await bcrypt.hash(req.body.password, 10)

  const updatedUser = await database.query(
    `UPDATE users SET password = $1, reset_password_token = NULL, reset_password_expire = NULL WHERE id = $2 RETURNING *`,
    [hashedPassword, user.rows[0].id],
  )
  sendToken(updatedUser.rows[0], 200, 'Password reset successfully', res)
})

export const updatePassword = catchAsyncErrors(async (req, res, next) => {
  const { currentPassword, newPassword, confirmNewPassword } = req.body
  console.log(currentPassword, newPassword, confirmNewPassword)
  if (!currentPassword || !newPassword || !confirmNewPassword) {
    return next(new ErrorHandler('Please provide all required fields.', 400))
  }
  const isPasswordMatch = await bcrypt.compare(currentPassword, req.user.password)
  if (!isPasswordMatch) {
    return next(new ErrorHandler('Current password is incorrect.', 401))
  }
  if (newPassword !== confirmNewPassword) {
    return next(new ErrorHandler('New passwords do not match.', 400))
  }

  if (
    newPassword.length < 8 ||
    newPassword.length > 16 ||
    confirmNewPassword.length < 8 ||
    confirmNewPassword.length > 16
  ) {
    return next(new ErrorHandler('Password must be between 8 and 16 characters.', 400))
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10)

  await database.query('UPDATE users SET password = $1 WHERE id = $2', [
    hashedPassword,
    req.user.id,
  ])

  res.status(200).json({
    success: true,
    message: 'Password updated successfully.',
  })
})

export const updateProfile = catchAsyncErrors(async (req, res, next) => {
  const { name, email } = req.body
  if (!name || !email) {
    return next(new ErrorHandler('Please provide all required fields.', 400))
  }
  if (name.trim().length === 0 || email.trim().length === 0) {
    return next(new ErrorHandler('Name and email cannot be empty.', 400))
  }
  let avatarData = {}
  if (req.files && req.files.avatar) {
    const { avatar } = req.files
    if (req.user?.avatar?.public_id) {
      await cloudinary.uploader.destroy(req.user.avatar.public_id)
    }

    const newProfileImage = await cloudinary.uploader.upload(avatar.tempFilePath, {
      folder: 'Ecommerce_Avatars',
      width: 150,
      crop: 'scale',
    })
    avatarData = {
      public_id: newProfileImage.public_id,
      url: newProfileImage.secure_url,
    }
  }

  let user
  if (Object.keys(avatarData).length === 0) {
    user = await database.query(
      'UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING *',
      [name, email, req.user.id],
    )
  } else {
    user = await database.query(
      'UPDATE users SET name = $1, email = $2, avatar = $3 WHERE id = $4 RETURNING *',
      [name, email, avatarData, req.user.id],
    )
  }

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully.',
    user: user.rows[0],
  })
})
