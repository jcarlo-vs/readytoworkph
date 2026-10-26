// /api/track
import express from 'express';
import { throttle } from '../../middleware/rateLimit.js';
import * as visits from './visits.controller.js';

const router = express.Router();
router.post('/track', throttle(120, 60_000, 'a minute'), visits.track);

export default router;
