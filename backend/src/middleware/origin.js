// In production the API is only reachable through Cloudflare: the site's Worker forwards /api requests
// with this secret header, so calls straight to the Cloud Run address are refused. Cloudflare also
// tells us the visitor's real address (otherwise every visitor would look like the Worker).
import { sameText } from '../lib/security.js';

export function originCheck(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  const secret = process.env.ORIGIN_SECRET;
  if (!secret) return next(); // local development
  if (!sameText(req.get('x-origin-secret') ?? '', secret)) return res.status(403).json({ error: 'Forbidden' });
  req.visitor = req.get('x-visitor-ip') || req.ip;
  req.country = req.get('x-visitor-country'); // Cloudflare's country headers don't survive the Worker's own request
  next();
}
