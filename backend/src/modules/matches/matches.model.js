// Smart Matching queries: saved runs (match_runs) and the agent's worker search.
import { MONTH_PH } from '../../config.js';
import { pool } from '../../db/index.js';
import { like } from '../../lib/paging.js';
import { WORKER_SELECT, WORKER_SORTS, workerFilters } from '../workers/workers.model.js';

const STALE = "interval '3 minutes'"; // a run still 'running' after this was interrupted

// The employer's plan and runs this calendar month (Philippine time). Interrupted and failed runs don't count.
export const usageThisMonth = async (employerId, db = pool) => (await db.query(
  `SELECT u.plan, (SELECT count(*)::int FROM match_runs WHERE employer_id = u.id AND created_at >= ${MONTH_PH}
     AND (status = 'done' OR (status = 'running' AND created_at > now() - ${STALE}))) AS used
   FROM users u WHERE u.id = $1`, [employerId])).rows[0];

export const stopStaleRuns = () => pool.query(`UPDATE match_runs SET status = 'failed', error = 'Interrupted before it finished', finished_at = now()
  WHERE status = 'running' AND created_at < now() - ${STALE}`);

// The employer's own job, with what the agent reads.
export const findJob = async (employerId, jobId) => (await pool.query(
  'SELECT id, title, description, skills, job_type, salary_min, salary_max, salary_period FROM jobs WHERE id = $1 AND employer_id = $2',
  [jobId, employerId])).rows[0];

// --- Runs ---

export const listRuns = async (jobId) => (await pool.query(
  `SELECT id, status, jsonb_array_length(coalesce(shortlist, '[]')) AS count, created_at FROM match_runs
   WHERE job_id = $1 ORDER BY created_at DESC LIMIT 20`, [jobId])).rows;

export const findRun = async (id) => (await pool.query('SELECT * FROM match_runs WHERE id = $1', [id])).rows[0];

export const hasRunning = async (employerId, db = pool) =>
  (await db.query("SELECT 1 FROM match_runs WHERE employer_id = $1 AND status = 'running'", [employerId])).rowCount > 0;

export const createRun = async (jobId, employerId, db = pool) =>
  (await db.query('INSERT INTO match_runs (job_id, employer_id) VALUES ($1, $2) RETURNING id', [jobId, employerId])).rows[0];

export const saveSteps = (id, steps) => pool.query('UPDATE match_runs SET steps = $2 WHERE id = $1', [id, JSON.stringify(steps)]);

export const finishRun = async (id, steps, { shortlist, summary, usage }) => (await pool.query(
  `UPDATE match_runs SET status = 'done', steps = $2, shortlist = $3, summary = $4, input_tokens = $5, output_tokens = $6, finished_at = now()
   WHERE id = $1 RETURNING *`,
  [id, JSON.stringify(steps), JSON.stringify(shortlist), summary, usage.input_tokens, usage.output_tokens])).rows[0];

export const failRun = (id, steps, error) => pool.query(
  "UPDATE match_runs SET status = 'failed', steps = $2, error = $3, finished_at = now() WHERE id = $1", [id, JSON.stringify(steps), error]);

// --- The agent's search ---

// Unlike the Hire Talent box (one phrase), the agent's search words each count: a worker matching any of
// them is found, and people matching more of them come first, like a recruiter typing keywords.
export async function searchWorkers({ query, skills, max_rate, availability }) {
  const params = [];
  const { where, add } = workerFilters({ skills, rate_max: max_rate, availability }, params);
  const words = [...new Set(String(query ?? '').toLowerCase().split(/[\s,;/]+/).filter((w) => w.length > 1))].slice(0, 6);
  const hits = words.map((w) => {
    const t = add(like(w));
    return `(p.title ILIKE ${t} OR p.bio ILIKE ${t} OR EXISTS (SELECT 1 FROM unnest(p.skills) s WHERE s ILIKE ${t}))`;
  });
  if (hits.length) where.push(`(${hits.join(' OR ')})`);
  const score = hits.length ? `(${hits.map((h) => `${h}::int`).join(' + ')}) DESC, ` : '';
  return (await pool.query(`${WORKER_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${score}${WORKER_SORTS.active} LIMIT 15`, params)).rows;
}

// A worker who is in search (has a profile, not paused or suspended).
export const findSearchableWorker = async (id) => (await pool.query(
  `${WORKER_SELECT} WHERE u.id = $1 AND p.title <> '' AND u.deactivated_at IS NULL AND u.suspended_at IS NULL`, [id])).rows[0];

export const findResumeText = async (workerId) =>
  (await pool.query('SELECT resume_text FROM worker_profiles WHERE user_id = $1', [workerId])).rows[0]?.resume_text;

// Which of these workers the employer marked as hired.
export const hiredAmong = async (employerId, ids) => new Set((await pool.query(
  'SELECT worker_id FROM hires WHERE employer_id = $1 AND worker_id = ANY($2)', [employerId, ids])).rows.map((h) => h.worker_id));
