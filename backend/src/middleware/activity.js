// Runs on every API request: remembers who is active, and lets the sample-job autopilot post what's due.
import { pool } from '../db/index.js';
import { countryOf } from '../lib/request.js';
import { touchLastSeen } from '../models/users.model.js';
import { postDueSampleJobs } from '../modules/sample-jobs/sample-jobs.service.js';
import { getSettings } from '../services/settings.js';

// Remembers when each signed-in user was last active and their country (Cloudflare's guess from the
// IP; the IP itself isn't stored), for the admin dashboard. At most one write per user per minute.
// The admin looking around someone's account ("Log in as") doesn't count as them being active.
const lastSeen = new Map();
export function trackActivity(req, res, next) {
  res.on('finish', () => {
    const id = req.user?.id;
    if (!id || req.user.impersonated || Date.now() - (lastSeen.get(id) ?? 0) < 60_000) return;
    lastSeen.set(id, Date.now());
    touchLastSeen(id, countryOf(req)).catch((err) => console.error(err));
  });
  next();
}

// The sample-job autopilot (sample-jobs.service.js): at most once a minute per server, post the sample jobs that are due.
let sampleCheck = 0;
export async function postSampleJobs(req, res, next) {
  if (Date.now() - sampleCheck > 60_000) {
    sampleCheck = Date.now();
    try { await postDueSampleJobs(pool, (await getSettings()).sample_jobs_per_day); } catch (err) { console.error('Sample jobs', err); }
  }
  next();
}
