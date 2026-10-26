// /api/billing
import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as billing from './billing.controller.js';

const router = express.Router();
router.get('/billing/config', billing.config);
router.post('/billing/checkout', requireAuth('employer'), billing.checkout);
router.get('/billing/subscription', requireAuth('employer'), billing.subscription);
router.post('/billing/portal', requireAuth('employer'), billing.portal);
router.post('/billing/change', requireAuth('employer'), billing.change);
router.post('/billing/webhook', billing.webhook);

export default router;
