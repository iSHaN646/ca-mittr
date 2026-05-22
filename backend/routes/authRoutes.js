import express from 'express';
import {
  registerRequest,
  loginRequest,
  verifyOtp,
} from '../controllers/authController.js';

const router = express.Router();

router.post('/register-request', registerRequest);
router.post('/login-request', loginRequest);
router.post('/verify-otp', verifyOtp);

export default router;
