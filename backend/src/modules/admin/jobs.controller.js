// Admin › Jobs, and the sample-job autopilot.
import { pool } from '../../db/index.js';
import { like, pageOf, sizeOf } from '../../lib/paging.js';
import { num } from '../../lib/validate.js';
import * as SampleJobs from '../sample-jobs/sample-jobs.model.js';
import { backfillSampleJobs, phDay, postSampleJob, sampleEmployers } from '../sample-jobs/sample-jobs.service.js';
import * as Admin from './admin.model.js';
import { logAdmin } from './admin.service.js';

// Every job post, newest first; search by title or employer, filter open/closed.
export const list = async (req, res) => {
  const status = ['open', 'closed'].includes(req.query.status) ? req.query.status : '';
  const { jobs, total } = await Admin.listJobs({ search: like(req.query.q), status, offset: pageOf(req) * sizeOf(req), size: sizeOf(req) });
  res.json({ jobs, total, page_size: sizeOf(req) });
};

// The sample-job autopilot: how many sample jobs exist and today's plan; post one now; delete them all.
// Only today's plan counts; yesterday's, or one left over from before it was turned off, shows as nothing planned.
export const sampleStatus = async (req, res) => {
  const total = await SampleJobs.countJobs();
  const plan = await SampleJobs.findPlan();
  const { times = [], posted = 0 } = plan.day === phDay(Date.now()) && plan.per_day ? plan : {};
  res.json({ total, planned: times.length, posted, next_at: times[posted] ? new Date(times[posted]).toISOString() : null });
};

// One now, or with { count } that many dated over the past hours (to fill an empty board).
export const postSample = async (req, res) => {
  const count = req.body?.count;
  if (count === undefined) await postSampleJob(pool, await sampleEmployers(pool));
  else if (Number.isInteger(count) && count >= 1 && count <= 100) {
    await backfillSampleJobs(pool, count);
    logAdmin('Added sample jobs', null, `${count} jobs`);
  } else return res.status(400).json({ error: 'Choose between 1 and 100 jobs' });
  res.status(201).json({ added: count ?? 1 });
};

export const deleteSamples = async (req, res) => {
  const { deleted, closed } = await SampleJobs.removeJobs();
  logAdmin('Removed all sample jobs', null, `${deleted} deleted, ${closed} closed`);
  res.json({ deleted, closed });
};

// Close a post (spam, scams, a job the employer forgot) or reopen it. Closing hides it from search and stops applications.
export const setClosed = async (req, res) => {
  const j = await Admin.setJobClosed(num(req.params.id), req.body?.closed === true);
  if (!j) return res.status(404).json({ error: 'Job not found' });
  logAdmin(req.body?.closed === true ? 'Closed a job' : 'Reopened a job', j.employer_id, j.title);
  res.status(204).end();
};
