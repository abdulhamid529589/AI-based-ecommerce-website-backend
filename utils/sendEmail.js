import nodeMailer from 'nodemailer'

export const sendEmail = async ({ email, subject, message }) => {
  // ✅ CRITICAL FIX: Validate SMTP configuration exists
  if (!process.env.SMTP_HOST || !process.env.SMTP_MAIL || !process.env.SMTP_PASSWORD) {
    const missingVars = []
    if (!process.env.SMTP_HOST) missingVars.push('SMTP_HOST')
    if (!process.env.SMTP_MAIL) missingVars.push('SMTP_MAIL')
    if (!process.env.SMTP_PASSWORD) missingVars.push('SMTP_PASSWORD')
    throw new Error(`SMTP configuration incomplete. Missing: ${missingVars.join(', ')}`)
  }

  const transporter = nodeMailer.createTransport({
    host: process.env.SMTP_HOST,
    service: process.env.SMTP_SERVICE,
    port: process.env.SMTP_PORT,
    auth: {
      user: process.env.SMTP_MAIL,
      pass: process.env.SMTP_PASSWORD,
    },
  })

  const mailOptions = {
    from: process.env.SMTP_MAIL,
    to: email,
    subject,
    html: message,
  }

  try {
    const info = await transporter.sendMail(mailOptions)
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ Email sent to:', email, 'Message ID:', info.messageId)
    }
    return { success: true, messageId: info.messageId }
  } catch (error) {
    console.error('❌ Email send failed:', error.message)
    throw new Error(`Failed to send email: ${error.message}`)
  }
}
