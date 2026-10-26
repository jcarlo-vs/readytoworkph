// /api/messages
import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { perUser, throttle } from '../../middleware/rateLimit.js';
import * as messages from './messages.controller.js';

const router = express.Router();
router.get('/messages', requireAuth(), messages.inbox);
router.post('/messages/hide', requireAuth(), messages.hide);
router.get('/messages/unread-count', requireAuth(), messages.unreadCount);
router.get('/messages/:userId', requireAuth(), messages.conversation);
router.post('/messages/bulk', requireAuth('employer'), throttle(10, 60 * 60_000, 'an hour', perUser), messages.bulk);
router.post('/messages/:userId', requireAuth(), throttle(60, 60 * 60_000, 'an hour', perUser), messages.send);

export default router;
