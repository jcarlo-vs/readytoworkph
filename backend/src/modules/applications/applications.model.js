// Application queries: applying, the employer's applicant lists (only as many as their plan shows: `limit`,
// null = everyone), and the worker's own applications.
import { TODAY_PH } from '../../config.js';
import { pool } from '../../db/index.js';
import { RANK } from '../../services/plans.js';

// --- Applying (inside the apply transaction) ---

// The job being applied to, locked until the transaction ends so parallel applies can't push it past its cap.
export const lockJob = async (jobId, db) => (await db.query(
  'SELECT j.closed_at, j.max_applications, u.plan, u.deactivated_at, u.suspended_at FROM jobs j JOIN users u ON u.id = j.employer_id WHERE j.id = $1 FOR UPDATE OF j',
  [jobId])).rows[0];

export const countForJob = async (jobId, db = pool) =>
  (await db.query('SELECT count(*)::int AS n FROM applications WHERE job_id = $1', [jobId])).rows[0].n;

export const hasApplied = async (jobId, workerId, db = pool) =>
  (await db.query('SELECT 1 FROM applications WHERE job_id = $1 AND worker_id = $2', [jobId, workerId])).rowCount > 0;

// Full: it leaves search and stops taking more.
export const closeJob = (jobId, db = pool) => db.query('UPDATE jobs SET closed_at = now() WHERE id = $1', [jobId]);

// The resume is attached only when asked and the worker has one. Returns nothing if they already applied.
export const create = async ({ jobId, workerId, coverLetter, credits, attachResume }, db = pool) => (await db.query(
  `INSERT INTO applications (job_id, worker_id, cover_letter, credits, resume_attached)
   SELECT j.id, $2, $3, $4, $5 AND p.resume_key IS NOT NULL
   FROM jobs j LEFT JOIN worker_profiles p ON p.user_id = $2
   WHERE j.id = $1
   ON CONFLICT (job_id, worker_id) DO NOTHING RETURNING id, job_id, credits, resume_attached, created_at`,
  [jobId, workerId, coverLetter, credits, attachResume])).rows[0];

export const jobExists = async (jobId) => (await pool.query('SELECT 1 FROM jobs WHERE id = $1', [jobId])).rowCount > 0;

// Credits put on applications today and how many were sent, Philippine time; and when that resets.
export const usedToday = async (workerId, db = pool) => (await db.query(
  `SELECT coalesce(sum(credits), 0)::int AS used, count(*)::int AS applications, ${TODAY_PH} + interval '1 day' AS resets_at
   FROM applications WHERE worker_id = $1 AND created_at >= ${TODAY_PH}`,
  [workerId])).rows[0];

// --- The worker's side ---

export const findMine = async (jobId, workerId) => (await pool.query(
  'SELECT id, cover_letter, credits, resume_attached, created_at FROM applications WHERE job_id = $1 AND worker_id = $2',
  [jobId, workerId])).rows[0];

// Status for the worker's dashboard: hired by this employer (for this job or in general), messaged by
// them, or the job has closed.
export const listForWorker = async (workerId) => (await pool.query(
  `SELECT a.id, a.credits, a.created_at, j.id AS job_id, j.title, j.closed_at, u.id AS employer_id, u.name AS employer_name,
     EXISTS (SELECT 1 FROM hires h WHERE h.employer_id = j.employer_id AND h.worker_id = a.worker_id AND (h.job_id = j.id OR h.job_id IS NULL)) AS hired,
     EXISTS (SELECT 1 FROM messages m WHERE m.sender_id = j.employer_id AND m.recipient_id = a.worker_id) AS messaged
   FROM applications a JOIN jobs j ON j.id = a.job_id JOIN users u ON u.id = j.employer_id
   WHERE a.worker_id = $1 ORDER BY a.created_at DESC`,
  [workerId])).rows;

// --- The employer's side ---

// One job's applicants, most credits first; `total` on each row counts everyone who applied.
export const listForJob = async (jobId, employerId, limit) => (await pool.query(
  `SELECT a.id, a.cover_letter, a.credits, a.analysis, a.analyzed_at, CASE WHEN a.resume_attached THEN p.resume_name END AS resume_name, a.created_at, u.id AS worker_id, u.name, u.email, p.title, p.skills,
     u.deleted_at IS NOT NULL AS deleted, u.deactivated_at IS NOT NULL AS deactivated, p.hourly_rate,
     EXISTS (SELECT 1 FROM messages m WHERE m.sender_id = $2 AND m.recipient_id = u.id) AS messaged,
     EXISTS (SELECT 1 FROM hires h WHERE h.employer_id = $2 AND h.worker_id = u.id) AS hired,
     EXISTS (SELECT 1 FROM saved_workers s WHERE s.employer_id = $2 AND s.worker_id = u.id) AS saved, a.not_fit,
     (SELECT count(*)::int FROM applications x WHERE x.job_id = a.job_id) AS total
   FROM applications a JOIN jobs j ON j.id = a.job_id
   JOIN users u ON u.id = a.worker_id LEFT JOIN worker_profiles p ON p.user_id = u.id
   WHERE a.job_id = $1 AND j.employer_id = $2 AND ($3::int IS NULL OR ${RANK} < $3) ORDER BY a.credits DESC, a.created_at ASC, a.id`,
  [jobId, employerId, limit])).rows;

// Seeing the applicants so far (clears the 🔔): one job, or all of the employer's jobs.
export const markSeen = (jobId, employerId) =>
  pool.query('UPDATE jobs SET applicants_seen_at = now() WHERE id = $1 AND employer_id = $2', [jobId, employerId]);
export const markAllSeen = (employerId) => pool.query('UPDATE jobs SET applicants_seen_at = now() WHERE employer_id = $1', [employerId]);

// `reason` null clears it.
export const setNotFit = async (id, employerId, reason) => (await pool.query(
  `UPDATE applications a SET not_fit = $3, not_fit_at = CASE WHEN $3::text IS NULL THEN NULL ELSE now() END
   FROM jobs j WHERE a.id = $1 AND j.id = a.job_id AND j.employer_id = $2 RETURNING a.id, a.not_fit`,
  [id, employerId, reason])).rows[0];

export const listRecent = async (employerId, limit) => (await pool.query(
  `SELECT a.id, a.created_at, a.job_id, j.title AS job_title, u.id AS worker_id, u.name, p.title
   FROM applications a JOIN jobs j ON j.id = a.job_id JOIN users u ON u.id = a.worker_id LEFT JOIN worker_profiles p ON p.user_id = u.id
   WHERE j.employer_id = $1 AND u.deleted_at IS NULL AND ($2::int IS NULL OR ${RANK} < $2)
   ORDER BY a.created_at DESC, a.id DESC LIMIT 6`, [employerId, limit])).rows;

// Everyone who applied to any of the employer's jobs, newest first; `visible` says whether their plan shows them.
export const listForEmployer = async (employerId, limit) => (await pool.query(
  `SELECT a.id, a.created_at, a.credits, (a.analysis->>'score')::int AS score, a.job_id, j.title AS job_title,
     u.id AS worker_id, u.name, p.title, p.hourly_rate, u.deleted_at IS NOT NULL AS deleted, u.deactivated_at IS NOT NULL AS deactivated,
     a.created_at > j.applicants_seen_at AS is_new,
     EXISTS (SELECT 1 FROM messages m WHERE m.sender_id = $1 AND m.recipient_id = u.id) AS messaged,
     EXISTS (SELECT 1 FROM hires h WHERE h.employer_id = $1 AND h.worker_id = u.id) AS hired,
     ${RANK} < coalesce($2::int, 2147483647) AS visible
   FROM applications a JOIN jobs j ON j.id = a.job_id JOIN users u ON u.id = a.worker_id LEFT JOIN worker_profiles p ON p.user_id = u.id
   WHERE j.employer_id = $1 ORDER BY a.created_at DESC, a.id DESC LIMIT 1000`, [employerId, limit])).rows;

// Applications since the employer last opened each job's applicants, newest job first.
export const countNewByJob = async (employerId) => (await pool.query(
  `SELECT j.id, j.title, count(*)::int AS count, max(a.created_at) AS latest
   FROM jobs j JOIN applications a ON a.job_id = j.id AND a.created_at > j.applicants_seen_at
   WHERE j.employer_id = $1 GROUP BY j.id ORDER BY latest DESC LIMIT 20`, [employerId])).rows;

// The resume attached to an application, with the applicant's place in line (`rank`).
export const findResume = async (id, employerId) => (await pool.query(
  `SELECT p.resume_key, p.resume_name, ${RANK} AS rank FROM applications a JOIN jobs j ON j.id = a.job_id
   JOIN worker_profiles p ON p.user_id = a.worker_id
   WHERE a.id = $1 AND j.employer_id = $2 AND a.resume_attached`,
  [id, employerId])).rows[0];
