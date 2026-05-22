import nodemailer from 'nodemailer';

/**
 * Utility helper to send real emails using Nodemailer with SMTP transport.
 * If SMTP credentials are not configured in .env, it gracefully logs details
 * to the server console to prevent app crashes during local development.
 */
const sendEmail = async (options) => {
  const hasSmtpConfig = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;

  if (!hasSmtpConfig) {
    console.log(`\n--- [SMTP NOT CONFIGURED - CONSOLE FALLBACK] ---`);
    console.log(`To: ${options.email}`);
    console.log(`Subject: ${options.subject}`);
    console.log(`OTP Code: ${options.otp}`);
    console.log(`HTML Template: Sent to console.`);
    console.log(`-------------------------------------------------\n`);
    return { success: true, fallback: true };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_PORT === '465', // true for port 465, false otherwise
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 10000, // 10 seconds timeout limit
    socketTimeout: 10000,
  });

  const mailOptions = {
    from: `"${process.env.FROM_NAME || 'CA-MITTR Ledger'}" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
    to: options.email,
    subject: options.subject,
    html: options.html,
  };

  const info = await transporter.sendMail(mailOptions);
  console.log(`[SMTP] Email sent successfully: ${info.messageId}`);
  return { success: true, messageId: info.messageId };
};

export default sendEmail;
