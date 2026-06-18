/**
 * Strip sensitive fields before sending user records in API responses.
 */
export const sanitizeUser = (user) => {
  if (!user) return null

  const {
    password,
    reset_password_token,
    reset_password_expire,
    ...safeUser
  } = user

  return safeUser
}
