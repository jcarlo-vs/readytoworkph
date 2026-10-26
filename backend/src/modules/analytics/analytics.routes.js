// /api/analytics
import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as analytics from './analytics.controller.js';

const router = express.Router();
router.get('/analytics', requireAuth('employer'), analytics.overview);

export default router;
