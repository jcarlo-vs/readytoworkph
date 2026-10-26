// What each plan allows, applied: who is on which plan, application caps, hidden applicants.
import { PLAN_LIMITS } from '../config.js';
import { pool } from '../db/index.js';
import { findPlan } from '../models/users.model.js';
import { getSettings } from './settings.js';

// Most applications one job can take on a plan (Free 20, Pro 100, Premium the site-wide most), and what to say past it.
export const jobCap = (plan, siteMax) => Math.min(siteMax, PLAN_LIMITS[plan]?.applicants ?? Infinity);

export const capMessage = (plan, siteMax) => `The ${PLAN_LIMITS[plan].name} plan accepts up to ${jobCap(plan, siteMax)} applications per job. ` +
  (plan === 'free' ? `Upgrade to Pro to accept up to ${jobCap('pro', siteMax)}, or Premium for up to ${siteMax}.` : `Upgrade to Premium to accept up to ${siteMax}.`);

// A job's limit above the plan's cap is refused (402 with `upgrade`); returns true when it answered.
export async function overCap(req, res, max) {
  if (max == null) return false;
  const plan = await planOf(pool, req.user.id);
  const { max_job_applications } = await getSettings();
  if (max <= jobCap(plan, max_job_applications)) return false;
  res.status(402).json({ error: capMessage(plan, max_job_applications), upgrade: plan !== 'premium' });
  return true;
}

export const planOf = (db, userId) => findPlan(userId, db);

// An application's place in line for its job (0 = first to apply). Employers see applicants first come,
// first served up to their plan's limit (Free: the first 20); later ones stay hidden until they upgrade.
// Credits don't change who is visible, only the order the visible ones are listed in.
export const RANK = `(SELECT count(*) FROM applications b WHERE b.job_id = a.job_id
  AND (b.created_at, b.id) < (a.created_at, a.id))::int`;

export const hiddenApplicant = (res, plan) => res.status(402).json({
  error: `This applicant is beyond the ${PLAN_LIMITS[plan].applicants} you can see on the ${PLAN_LIMITS[plan].name} plan. Upgrade to see them.`, upgrade: true,
});
