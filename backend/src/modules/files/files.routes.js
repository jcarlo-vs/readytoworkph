// Resume and photo uploads
import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { perUser, throttle } from '../../middleware/rateLimit.js';
import { MAX_PHOTO_MB, MAX_RESUME_MB } from './files.service.js';
import * as files from './files.controller.js';

const uploads = throttle(20, 60 * 60_000, 'an hour', perUser); // resume + photo uploads (reading PDFs is heavy)

const router = express.Router();
router.get('/profile/resume', requireAuth('worker'), files.myResume);
router.put('/profile/resume', requireAuth('worker'), uploads, express.raw({ type: 'application/pdf', limit: `${MAX_RESUME_MB}mb` }), files.uploadResume);
router.delete('/profile/resume', requireAuth('worker'), files.removeResume);
router.get('/users/:id/photo', files.photo);
router.put('/profile/photo', requireAuth(), uploads, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: `${MAX_PHOTO_MB}mb` }), files.uploadPhoto);
router.delete('/profile/photo', requireAuth(), files.removePhoto);

export default router;
