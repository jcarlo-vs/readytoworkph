// Feedback and support
import express from 'express';
import { throttle } from '../../middleware/rateLimit.js';
import * as support from './support.controller.js';

const router = express.Router();
router.post('/feedback', throttle(10, 60 * 60_000, 'an hour'), support.feedback);
router.post('/contact', throttle(5, 60 * 60_000, 'an hour'), support.contact);
router.post('/unsubscribe', support.unsubscribe);
router.post('/support/inbound', support.inbound);

export default router;
