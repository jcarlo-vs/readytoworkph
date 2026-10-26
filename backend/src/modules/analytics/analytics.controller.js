// Hiring analytics (Premium).
import { pool } from '../../db/index.js';
import { num } from '../../lib/validate.js';
import { planOf } from '../../services/plans.js';
import { isOwn } from '../jobs/jobs.model.js';
import * as Analytics from './analytics.model.js';

// One employer's hiring at a glance, for the last 7, 30 or 90 days and for all jobs or one job:
// headline numbers against the period before, applications over time (Philippine days or weeks),
// the funnel from applied to replied, the fit-score mix, the best candidates not yet messaged, and
// every job's numbers. Premium sees everyone who applied, so these count every application.
const RANGES = [7, 30, 90];

export const overview = async (req, res) => {
  if ((await planOf(pool, req.user.id)) !== 'premium')
    return res.status(402).json({ error: 'Hiring analytics is part of the Premium plan', upgrade: true });
  const days = RANGES.includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const jobId = req.query.job ? num(req.query.job) : null;
  if (jobId !== null) {
    if (!(await isOwn(jobId, req.user.id))) return res.status(404).json({ error: 'Job not found' });
  }
  const { t, first, chart, candidates, jobs, unit } = await Analytics.report(req.user.id, days, jobId);
  const { strong, good, partial, poor, ...tiles } = t;
  res.json({
    days, job: jobId, unit, chart,
    tiles: { ...tiles, first_applicant_hours: first?.hours ?? null },
    funnel: { applied: t.applicants, scored: t.scored, messaged: t.messaged, replied: t.replied },
    mix: { strong, good, partial, poor },
    candidates, jobs,
  });
};
