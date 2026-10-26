// Smart Matching
import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { perUser, throttle } from '../../middleware/rateLimit.js';
import * as matches from './matches.controller.js';

const router = express.Router();
router.get('/jobs/:id/matches', requireAuth('employer'), matches.latest);
router.post('/jobs/:id/matches', requireAuth('employer'), throttle(20, 60 * 60_000, 'an hour', perUser), matches.run);

export default router;
