import crypto from 'crypto';
import User from '../models/User.js';
import sendEmail from '../utils/sendEmail.js';

// Helper to generate a beautiful, responsive HTML email template for OTP
const getOtpTemplate = (otpCode) => `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 28px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);">
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="display: inline-block; background: #e0e7ff; color: #4f46e5; padding: 10px; border-radius: 50%; width: 44px; height: 44px; line-height: 44px; text-align: center; font-size: 20px; font-weight: bold; margin-bottom: 8px;">
        🏛️
      </div>
      <h2 style="color: #4f46e5; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">CA-MITTR Ledger</h2>
      <p style="color: #6b7280; margin: 4px 0 0; font-size: 13.5px; font-weight: 500;">Financial Statement Portal</p>
    </div>
    
    <div style="padding: 24px; background: #f9fafb; border-radius: 8px; text-align: center; border: 1px solid #f3f4f6;">
      <p style="margin: 0 0 16px; color: #374151; font-size: 14.5px; font-weight: 500; line-height: 1.5;">
        You requested a verification code to access your account ledger. Please enter the OTP below:
      </p>
      
      <div style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #111827; font-family: 'Courier New', Courier, monospace; margin: 18px 0; background: #ffffff; border: 1px dashed #c7d2fe; padding: 12px; border-radius: 6px; display: inline-block; padding-left: 20px;">
        ${otpCode}
      </div>
      
      <p style="margin: 16px 0 0; color: #9ca3af; font-size: 12px;">
        Valid for <strong>10 minutes</strong>. If you did not request this code, you can safely ignore this email.
      </p>
    </div>
    
    <hr style="border: 0; border-top: 1px solid #f3f4f6; margin: 28px 0;" />
    
    <div style="text-align: center;">
      <p style="margin: 0; color: #9ca3af; font-size: 11px;">
        This is an automated security system notification. Please do not reply directly to this email.
      </p>
      <p style="margin: 6px 0 0; color: #4f46e5; font-size: 11.5px; font-weight: 600;">
        CA-MITTR Ledger System &copy; ${new Date().getFullYear()}
      </p>
    </div>
  </div>
`;

// @desc    Register request (Sends OTP)
// @route   POST /api/auth/register-request
export const registerRequest = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email address is required.' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'A user with this email address already exists.' });
    }

    // Generate real secure 6-digit random OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    // Create user in unverified state (cleared token)
    await User.create({
      email: email.toLowerCase(),
      otpCode,
      otpExpires,
      token: null,
    });

    // Send Real OTP Email (non-blocking background task)
    sendEmail({
      email: email.toLowerCase(),
      subject: `[CA-MITTR Ledger] Your Security Verification OTP is ${otpCode}`,
      otp: otpCode,
      html: getOtpTemplate(otpCode),
    }).catch((emailErr) => {
      console.error('[Email Error] Failed to send registration email:', emailErr.message);
    });

    res.status(200).json({ success: true, message: 'OTP verification code sent successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Server Error', message: error.message });
  }
};

// @desc    Login request (Sends OTP)
// @route   POST /api/auth/login-request
export const loginRequest = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email address is required.' });
    }

    // Find registered user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not registered. Please sign up first.' });
    }

    // Generate real secure 6-digit random OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.otpCode = otpCode;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
    await user.save();

    // Send Real OTP Email (non-blocking background task)
    sendEmail({
      email: email.toLowerCase(),
      subject: `[CA-MITTR Ledger] Your Security Verification OTP is ${otpCode}`,
      otp: otpCode,
      html: getOtpTemplate(otpCode),
    }).catch((emailErr) => {
      console.error('[Email Error] Failed to send login email:', emailErr.message);
    });

    res.status(200).json({ success: true, message: 'OTP verification code sent successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Server Error', message: error.message });
  }
};

// @desc    Verify OTP and return token
// @route   POST /api/auth/verify-otp
export const verifyOtp = async (req, res) => {
  try {
    const { email, otpCode } = req.body;

    if (!email || !otpCode) {
      return res.status(400).json({ success: false, error: 'All fields (email, OTP) are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User account not found.' });
    }

    // Check if OTP matches and is not expired
    if (!user.otpCode || user.otpCode !== otpCode) {
      return res.status(400).json({ success: false, error: 'Invalid verification OTP code.' });
    }

    if (new Date() > user.otpExpires) {
      return res.status(400).json({ success: false, error: 'Verification OTP has expired. Please request a new one.' });
    }

    // Generate a secure session token
    const token = crypto.randomBytes(32).toString('hex');
    user.token = token;
    user.otpCode = undefined;
    user.otpExpires = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully.',
      token,
      user: {
        id: user._id,
        email: user.email,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Server Error', message: error.message });
  }
};
