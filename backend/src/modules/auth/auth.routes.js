// /api/auth
import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { perUser, throttle } from '../../middleware/rateLimit.js';
import * as auth from './auth.controller.js';

const router = express.Router();
router.post('/auth/register', auth.register);
router.post('/auth/login', auth.login);
router.post('/auth/logout', auth.logout);
router.post('/auth/forgot', auth.forgotPassword);
router.post('/auth/verify', requireAuth(null, { unconfirmed: true }), auth.verifyEmail);
router.post('/auth/verify/resend', requireAuth(null, { unconfirmed: true }), throttle(6, 60 * 60_000, 'an hour', perUser), auth.resendCode);
router.put('/auth/email', requireAuth(null, { unconfirmed: true }), throttle(5, 60 * 60_000, 'an hour', perUser), auth.fixSignupEmail);
router.post('/auth/reset', auth.resetPassword);
router.post('/auth/google', throttle(30, 15 * 60_000, '15 minutes'), auth.google);

export default router;
