// Job posts: browse, view, post, edit, close, delete, and the employer's own list.
import { PLAN_LIMITS, TYPES } from '../../config.js';
import { pool } from '../../db/index.js';
import { bad, num, str } from '../../lib/validate.js';
import { lockUser } from '../../models/users.model.js';
import { capMessage, jobCap, overCap, planOf } from '../../services/plans.js';
import { getSettings } from '../../services/settings.js';
import * as Jobs from './jobs.model.js';
import { forViewer, jobFields, jobLive, plainJob, postLimitMessage } from './jobs.service.js';

export const list = async (req, res) => {
  const filters = {
    q: req.query.q ? str(req.query.q, 100) : null,
    skill: req.query.skill ? str(req.query.skill, 50).toLowerCase() : null,
    type: TYPES.includes(req.query.type) ? req.query.type : null,
  };
  const page = Math.min(500, Math.max(1, parseInt(req.query.page) || 1));
  res.json(await forViewer(req, await Jobs.listOpen(filters, page)));
};

// Open jobs for the sitemap Google reads (ids and dates only). Declared before /api/jobs/:id.
export const sitemap = async (req, res) => {
  res.set('Cache-Control', 'public, max-age=600').json(await Jobs.listForSitemap());
};

export const get = async (req, res) => {
  const job = await Jobs.findWithEmployer(num(req.params.id));
  job ? res.json((await forViewer(req, [job]))[0]) : res.status(404).json({ error: 'Job not found' });
};

export const create = async (req, res) => {
  const { error, values } = jobFields(req.body);
  if (error) return bad(res, error);
  if (await overCap(req, res, values[7])) return;
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    // Lock the employer's row so parallel posts can't slip past the monthly limit.
    await lockUser(req.user.id, db);
    const plan = await planOf(db, req.user.id);
    const max = PLAN_LIMITS[plan].posts;
    if (await Jobs.countPostedThisMonth(req.user.id, db) >= max) {
      await db.query('ROLLBACK');
      return res.status(402).json({ error: postLimitMessage(plan, max), upgrade: plan !== 'premium' });
    }
    const job = await Jobs.create(req.user.id, values, db);
    await db.query('COMMIT');
    res.status(201).json(plainJob(job));
    jobLive(req.user.id, job).catch((err) => console.error(err));
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
};

// How many jobs the employer can still post this month, for the post-a-job page.
export const quota = async (req, res) => {
  const plan = await planOf(pool, req.user.id);
  const posted = await Jobs.countPostedThisMonth(req.user.id);
  const max = PLAN_LIMITS[plan].posts;
  res.json({ plan, posted, limit: max, remaining: Math.max(0, max - posted), message: posted >= max ? postLimitMessage(plan, max) : null });
};

export const update = async (req, res) => {
  const { error, values } = jobFields(req.body);
  if (error) return bad(res, error);
  if (await overCap(req, res, values[7])) return;
  const job = await Jobs.update(num(req.params.id), req.user.id, values);
  job ? res.json(plainJob(job)) : res.status(404).json({ error: 'Job not found' });
};

// Closing stops new applications and hides the job from search; applicants and messages stay.
export const setClosed = async (req, res) => {
  if (typeof req.body.closed !== 'boolean') return bad(res, 'closed must be true or false');
  if (!req.body.closed) { // a full job stays closed
    const { max_job_applications } = await getSettings();
    const n = await Jobs.findLimits(num(req.params.id), req.user.id);
    if (n && n.received >= max_job_applications) return res.status(409).json({ error: `This job has ${n.received} applicants, the most a job can take (${max_job_applications}). Post a new job to keep hiring.` });
    const plan = await planOf(pool, req.user.id);
    if (n && n.received >= jobCap(plan, max_job_applications)) return res.status(402).json({ error: `This job has ${n.received} applicants. ${capMessage(plan, max_job_applications)}`, upgrade: true });
    if (n?.max_applications && n.received >= n.max_applications) return res.status(409).json({ error: `This job reached your limit of ${n.max_applications} applications. Raise the limit in Edit job to reopen it.` });
  }
  const job = await Jobs.setClosed(num(req.params.id), req.user.id, req.body.closed);
  job ? res.json(plainJob(job)) : res.status(404).json({ error: 'Job not found' });
};

export const remove = async (req, res) => {
  (await Jobs.remove(num(req.params.id), req.user.id)) ? res.status(204).end() : res.status(404).json({ error: 'Job not found' });
};

// Job posts used this month against the plan's limit (the dashboard shows "1 of 3 used").
export const postUsage = async (req, res) => {
  const plan = await planOf(pool, req.user.id);
  res.json({ used: await Jobs.countPostedThisMonth(req.user.id), limit: PLAN_LIMITS[plan].posts });
};

export const myJobs = async (req, res) => {
  res.json((await Jobs.listForEmployer(req.user.id)).map(plainJob));
};
