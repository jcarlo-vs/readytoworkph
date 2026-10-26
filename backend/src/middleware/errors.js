// The last stop for errors: too-large uploads and broken JSON get a plain answer; anything else is logged.
import { MAX_PHOTO_MB, MAX_RESUME_MB } from '../modules/files/files.service.js';

// (Express spots an error handler by its four arguments, so `next` stays.)
export function errorHandler(err, req, res, next) {
  if (err.type === 'entity.too.large')
    return res.status(413).json({ error: req.path.endsWith('/resume') ? `Your resume is too large (max ${MAX_RESUME_MB} MB)`
      : req.path.endsWith('/photo') ? `Your photo is too large (max ${MAX_PHOTO_MB} MB)` : 'Request is too large' });
  if (err.status >= 400 && err.status < 500) return res.status(err.status).json({ error: 'Bad request' }); // e.g. broken JSON
  console.error(err);
  res.status(500).json({ error: 'Server error' });
}
