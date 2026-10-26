// Workers, saved workers, hires
import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as workers from './workers.controller.js';

const router = express.Router();
router.get('/workers', requireAuth('employer'), workers.list);
router.get('/workers/:id', requireAuth(), workers.get);
router.put('/saved/:workerId', requireAuth('employer'), workers.save);
router.delete('/saved/:workerId', requireAuth('employer'), workers.unsave);
router.get('/saved', requireAuth('employer'), workers.saved);
router.put('/hires/:workerId', requireAuth('employer'), workers.hire);
router.delete('/hires/:workerId', requireAuth('employer'), workers.unhire);
router.get('/my/hires', requireAuth('employer'), workers.hires);
router.put('/profile', requireAuth('worker'), workers.updateProfile);
router.get('/workers/:id/resume', requireAuth(), workers.resume);

export default router;
