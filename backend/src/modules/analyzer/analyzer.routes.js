// Smart Score
import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { perUser, throttle } from '../../middleware/rateLimit.js';
import * as analyzer from './analyzer.controller.js';

const router = express.Router();
router.get('/analyzer/usage', requireAuth('employer'), analyzer.usage);
router.post('/applications/:id/analyze', requireAuth('employer'), throttle(300, 60 * 60_000, 'an hour', perUser), analyzer.analyze);

export default router;
