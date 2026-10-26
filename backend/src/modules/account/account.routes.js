// /api/me
import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { perUser, throttle } from '../../middleware/rateLimit.js';
import * as account from './account.controller.js';

// 1. Prove it's you: your password, or (Google-only accounts, no password) a code sent to your current email.
//    The old inbox isn't required otherwise: people often change email because they lost the old one.
// 2. A code goes to the new email; the switch happens only once it's entered.
// 3. Every other device is signed out, and the old email gets a notice.
const changeEmailTries = throttle(10, 60 * 60_000, 'an hour', perUser);

const router = express.Router();
router.post('/me/email/reauth', requireAuth(), changeEmailTries, account.sendReauthCode);
router.post('/me/email', requireAuth(), changeEmailTries, account.startEmailChange);
router.post('/me/email/resend', requireAuth(), changeEmailTries, account.resendEmailCode);
router.post('/me/email/confirm', requireAuth(), account.confirmEmailChange);
router.delete('/me', requireAuth(null, { unconfirmed: true }), throttle(5, 60 * 60_000, 'an hour', perUser), account.deleteMe);
router.post('/me/deactivate', requireAuth(null, { unconfirmed: true }), account.deactivate);
router.put('/me', requireAuth(), account.updateMe);
router.get('/me', requireAuth(null, { unconfirmed: true }), account.me);
router.put('/me/notifications', requireAuth(), account.setNotifications);

export default router;
