// Applications
import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as applications from './applications.controller.js';

const router = express.Router();
router.post('/jobs/:id/apply', requireAuth('worker'), applications.apply);
router.get('/jobs/:id/my-application', requireAuth('worker'), applications.mine);
router.get('/credits', requireAuth('worker'), applications.credits);
router.get('/jobs/:id/applications', requireAuth('employer'), applications.forJob);
router.put('/applications/:id/not-fit', requireAuth('employer'), applications.notFit);
router.get('/my/recent-applicants', requireAuth('employer'), applications.recent);
router.get('/my/applicants', requireAuth('employer'), applications.myApplicants);
router.get('/my/new-applicants', requireAuth('employer'), applications.newApplicants);
router.get('/my/applications', requireAuth('worker'), applications.myApplications);
router.get('/applications/:id/resume', requireAuth('employer'), applications.resume);

export default router;
