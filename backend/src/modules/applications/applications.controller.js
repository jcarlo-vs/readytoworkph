// Applying to jobs, and employers reviewing who applied.
import { DAILY_CREDITS, PLAN_LIMITS } from '../../config.js';
import { pool } from '../../db/index.js';
import { bad, num, str } from '../../lib/validate.js';
import { lockUser } from '../../models/users.model.js';
import { hooks } from '../../services/hooks.js';
import { hiddenApplicant, jobCap, planOf } from '../../services/plans.js';
import { getSettings } from '../../services/settings.js';
import { BULK_MAX } from '../messages/messages.service.js';
import * as Applications from './applications.model.js';
import { creditsToday } from './applications.service.js';

export const apply = async (req, res) => {
  const cover_letter = str(req.body.cover_letter);
  const credits = req.body.credits == null ? 1 : Number(req.body.credits);
  if (!cover_letter) return bad(res, 'Cover letter required');
  // Credits are optional: 0 still applies, it just ranks below applicants who bid.
  if (!Number.isInteger(credits) || credits < 0 || credits > DAILY_CREDITS)
    return bad(res, `Credits must be a whole number from 0 to ${DAILY_CREDITS}`);

  // Read settings before taking a connection: inside the transaction it would need a second one, and a
  // burst of applies holding every pooled connection would wait on each other forever.
  const { daily_applications, max_job_applications } = await getSettings();
  const jobId = num(req.params.id);
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    // Lock this worker's row so parallel applies can't overspend today's credits, and the job's row so
    // parallel applies can't push it past its cap.
    await lockUser(req.user.id, db);
    const target = await Applications.lockJob(jobId, db);
    // Counted after the lock, in its own statement, so it sees applies that committed while we waited.
    const received = await Applications.countForJob(jobId, db);
    if (target?.closed_at || target?.deactivated_at || target?.suspended_at) {
      await db.query('ROLLBACK');
      return res.status(409).json({ error: 'This job is closed and no longer accepting applications' });
    }
    if (await Applications.hasApplied(jobId, req.user.id, db)) {
      await db.query('ROLLBACK');
      return res.status(409).json({ error: 'You already applied' });
    }
    const { remaining, applications } = await creditsToday(db, req.user.id);
    // The job's own limit, if the employer set one, within what the employer's plan allows.
    const cap = Math.min(jobCap(target?.plan, max_job_applications), target?.max_applications ?? Infinity);
    if (target && received >= cap) { // full before this change, or the cap was lowered
      await Applications.closeJob(jobId, db);
      await db.query('COMMIT');
      return res.status(409).json({ error: 'This job is full and no longer accepting applications' });
    }
    if (applications >= daily_applications) {
      await db.query('ROLLBACK');
      return res.status(429).json({ error: `You can send up to ${daily_applications} applications a day. Try again after midnight.` });
    }
    if (credits > remaining) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: `You have ${remaining} credits left today` });
    }
    const application = await Applications.create(
      { jobId, workerId: req.user.id, coverLetter: cover_letter, credits, attachResume: req.body.attach_resume !== false }, db);
    // The application that fills the job closes it: it leaves search and stops taking more.
    if (application && received + 1 >= cap) await Applications.closeJob(jobId, db);
    await db.query('COMMIT');
    if (application) return res.status(201).json(application);
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
  (await Applications.jobExists(jobId)) ? res.status(409).json({ error: 'You already applied' }) : res.status(404).json({ error: 'Job not found' });
};

// The signed-in worker's application to this job, if any, so the job page can show it instead of the form.
export const mine = async (req, res) => {
  res.json({ application: (await Applications.findMine(num(req.params.id), req.user.id)) ?? null });
};

export const credits = async (req, res) => {
  res.json(await creditsToday(pool, req.user.id));
};

// Everyone can apply whatever the employer's plan; the employer sees their top applicants up to the
// plan's limit (`total` counts everyone, so the page can say how many are waiting behind an upgrade).
export const forJob = async (req, res) => {
  const plan = await planOf(pool, req.user.id);
  const limit = PLAN_LIMITS[plan].applicants;
  const rows = await Applications.listForJob(num(req.params.id), req.user.id, limit);
  // Opening the list counts as seeing every applicant so far (clears this job from the 🔔).
  if (!req.user.impersonated) await Applications.markSeen(num(req.params.id), req.user.id); // not when the admin is looking ("Log in as")
  res.json({ applicants: rows.map(({ total: _, ...a }) => a), total: rows[0]?.total ?? 0, limit, plan });
};

// Mark an application "Not a fit" for this job (with why), or clear it (`reason: null`). Private to the employer.
const NOT_FIT = ['skills', 'no_reply', 'suspicious', 'other'];

export const notFit = async (req, res) => {
  const reason = req.body?.reason ?? null;
  if (reason !== null && !NOT_FIT.includes(reason)) return bad(res, 'Pick a reason');
  const a = await Applications.setNotFit(num(req.params.id), req.user.id, reason);
  a ? res.json(a) : res.status(404).json({ error: 'Application not found' });
};

// The dashboard's "Latest applicants": newest applications across the employer's jobs, only ones their plan
// lets them see (the same top-N-per-job rule as the applicants page).
export const recent = async (req, res) => {
  const limit = PLAN_LIMITS[await planOf(pool, req.user.id)].applicants;
  const rows = await Applications.listRecent(req.user.id, limit);
  res.json(rows);
};

// The Applicants page: everyone who applied to any of this employer's jobs (only those their plan shows),
// newest first, with where each one stands. Opening it counts as seeing them (clears the 🔔).
export const myApplicants = async (req, res) => {
  const limit = PLAN_LIMITS[await planOf(pool, req.user.id)].applicants;
  const rows = await Applications.listForEmployer(req.user.id, limit);
  if (!req.user.impersonated) await Applications.markAllSeen(req.user.id);
  const visible = rows.filter((r) => r.visible).map(({ visible: _, ...r }) => r);
  res.json({ applicants: visible, hidden: rows.length - visible.length, bulk_max: BULK_MAX });
};

// The 🔔 in the menu bar: applications since the employer last opened each job's applicants, newest job first.
export const newApplicants = async (req, res) => {
  const rows = await Applications.countNewByJob(req.user.id);
  res.json({ count: rows.reduce((n, j) => n + j.count, 0), jobs: rows });
};

export const myApplications = async (req, res) => {
  res.json(await Applications.listForWorker(req.user.id));
};

// Only the employer who received the application can open the (current) resume attached to it.
export const resume = async (req, res) => {
  const plan = await planOf(pool, req.user.id);
  const a = await Applications.findResume(num(req.params.id), req.user.id);
  if (a && PLAN_LIMITS[plan].applicants !== null && a.rank >= PLAN_LIMITS[plan].applicants) return hiddenApplicant(res, plan);
  if (!a?.resume_key) return res.status(404).json({ error: 'No resume attached' });
  res.json({ url: await hooks.storage.signedUrl(a.resume_key, a.resume_name) });
};
