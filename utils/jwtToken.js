import jwt from 'jsonwebtoken'

export const sendToken = (user, statusCode, message, res) => {
  // Access token - short-lived (15 minutes) - uses dedicated access key
  const accessToken = jwt.sign(
    { id: user.id },
    process.env.JWT_SECRET_KEY_ACCESS || process.env.JWT_SECRET_KEY,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m',
    },
  )

  // Refresh token - long-lived (7 days) - uses dedicated refresh key
  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.JWT_SECRET_KEY_REFRESH || process.env.JWT_SECRET_KEY,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
    },
  )

  res
    .status(statusCode)
    .cookie('token', accessToken, {
      expires: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      httpOnly: true,
      sameSite: 'Lax', // Allow cross-site requests for frontend/dashboard
      secure: process.env.NODE_ENV === 'production',
    })
    .cookie('accessToken', accessToken, {
      expires: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      httpOnly: true,
      sameSite: 'Lax', // Allow cross-site requests for frontend/dashboard
      secure: process.env.NODE_ENV === 'production',
    })
    .cookie('refreshToken', refreshToken, {
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      httpOnly: true,
      sameSite: 'Lax', // Allow cross-site requests for frontend/dashboard
      secure: process.env.NODE_ENV === 'production',
    })
    .json({
      success: true,
      user,
      message,
      // 🔒 REMOVED: Don't send tokens in response body
      // Tokens are already in HttpOnly cookies, JS cannot access them
      // This prevents token exposure via network logs or error messages
    })
}
