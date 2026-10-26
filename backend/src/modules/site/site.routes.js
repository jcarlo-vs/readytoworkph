// Public site data
import express from 'express';
import * as site from './site.controller.js';

const router = express.Router();
router.get('/stats', site.stats);
router.get('/settings', site.publicSettings);

export default router;
