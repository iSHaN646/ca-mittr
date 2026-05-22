import nodemailer from 'nodemailer';

/**
 * Utility helper to send real emails using Nodemailer with SMTP transport.
 * If SMTP credentials are not configured in .env, it gracefully logs details
 * to the server console to prevent app crashes during local development.
 */
const sendEmail = async (options) => {
  // 1. Resend API HTTP transport (Uses standard HTTPS Port 443 - never blocked by cloud hosts!)
  if (process.env.RESEND_API_KEY) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: process.env.FROM_EMAIL || 'onboarding@resend.dev',
          to: options.email,
          subject: options.subject,
          html: options.html,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        const errorMessage = data.message || '';
        // Intercept Resend Sandbox restriction error to allow seamless testing flow
        if (errorMessage.includes('You can only send testing emails to your own email address')) {
          const fallbackEmail = 'ishan17052002@gmail.com';
          
          console.warn('\n--- [RESEND SANDBOX REDIRECTION INTERCEPT] ---');
          console.warn(`Attempted Destination: ${options.email}`);
          console.warn(`Redirecting To Verified Owner: ${fallbackEmail}`);
          console.warn('Reason: Resend sandbox account restricts recipient addresses.');
          console.warn('Action: Automatically forwarding the email so OTP/Testing is not blocked.');
          console.warn('-----------------------------------------------\n');

          const retryResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: process.env.FROM_EMAIL || 'onboarding@resend.dev',
              to: fallbackEmail,
              subject: `[SANDBOX REDIRECTED: ${options.email}] ${options.subject}`,
              html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #fffbe5; border: 1px solid #f59e0b; padding: 16px; border-radius: 8px; margin-bottom: 24px; color: #b45309; font-size: 13.5px; line-height: 1.5;">
                  <strong>💡 Sandbox Redirect Alert:</strong> This email was originally sent to <strong>${options.email}</strong>, but was redirected to your verified email address (<strong>${fallbackEmail}</strong>) due to Resend sandbox restrictions. This allows you to test signup and login with any email address!
                </div>
                ${options.html}
              `,
            }),
          });

          const retryData = await retryResponse.json();
          if (retryResponse.ok) {
            console.log(`[Resend HTTP Redirect] Email redirected and sent successfully: ${retryData.id}`);
            return { success: true, messageId: retryData.id };
          } else {
            throw new Error(retryData.message || 'Resend HTTP API failure on redirect retry');
          }
        }
        throw new Error(errorMessage || 'Resend HTTP API failure');
      }
      console.log(`[Resend HTTP] Email sent successfully: ${data.id}`);
      return { success: true, messageId: data.id };
    } catch (err) {
      console.error('[Resend HTTP Error] Failed to send email via Resend:', err.message);
      return { success: false, error: err.message };
    }
  }

  // 2. Standard SMTP Transport
  const hasSmtpConfig = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;
  if (hasSmtpConfig) {
    try {
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
    } catch (err) {
      console.error('[SMTP Error] Failed to send email via SMTP:', err.message);
      return { success: false, error: err.message };
    }
  }

  // 3. Graceful Local Fallback
  console.log(`\n--- [SMTP/RESEND NOT CONFIGURED - CONSOLE FALLBACK] ---`);
  console.log(`To: ${options.email}`);
  console.log(`Subject: ${options.subject}`);
  console.log(`OTP Code: ${options.otp}`);
  console.log(`HTML Template: Sent to console.`);
  console.log(`-------------------------------------------------\n`);
  return { success: true, fallback: true };
};

export default sendEmail;
