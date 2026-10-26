// /api/jobs and the employer's job lists
import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { perUser, throttle } from '../../middleware/rateLimit.js';
import * as jobs from './jobs.controller.js';

const router = express.Router();
router.get('/jobs', jobs.list);
router.get('/jobs/sitemap', jobs.sitemap);
router.get('/jobs/:id', jobs.get);
router.post('/jobs', requireAuth('employer'), throttle(30, 60 * 60_000, 'an hour', perUser), jobs.create);
router.get('/my/job-quota', requireAuth('employer'), jobs.quota);
router.put('/jobs/:id', requireAuth('employer'), throttle(60, 60 * 60_000, 'an hour', perUser), jobs.update);
router.put('/jobs/:id/closed', requireAuth('employer'), jobs.setClosed);
router.delete('/jobs/:id', requireAuth('employer'), jobs.remove);
router.get('/my/post-usage', requireAuth('employer'), jobs.postUsage);
router.get('/my/jobs', requireAuth('employer'), jobs.myJobs);

export default router;
