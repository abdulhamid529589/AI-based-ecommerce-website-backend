import jwt from 'jsonwebtoken'

export const sendToken = (user, statusCode, message, res) => {
  // Access token - short-lived (1 hour)
  const accessToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET_KEY, {
    expiresIn: '1h',
  })

  // Refresh token - long-lived (7 days)
  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET_KEY,
    {
      expiresIn: '7d',
    },
  )

  res
    .status(statusCode)
    .cookie('accessToken', accessToken, {
      expires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      httpOnly: true,
    })
    .cookie('refreshToken', refreshToken, {
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      httpOnly: true,
    })
    .json({
      success: true,
      user,
      message,
      accessToken,
      refreshToken,
    })
}
