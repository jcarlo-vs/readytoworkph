// Job post queries.
import { MONTH_PH, PAGE_SIZE } from '../../config.js';
import { pool } from '../../db/index.js';
import { searchWords } from '../../lib/search.js';

// Open jobs from active employers. `filters`: q, skill, type. Every word of q must be in the title,
// description or skills (lib/search.js); jobs with more of the words in their title come first, then newest.
export async function listOpen({ q, skill, type }, page) {
  const where = ['j.closed_at IS NULL', 'u.deactivated_at IS NULL', 'u.suspended_at IS NULL'];
  const params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replaceAll('?', `$${params.length}`)); };
  const words = searchWords(q ?? '');
  const inTitle = [];
  for (const w of words) {
    add('(j.title ~* ? OR j.description ~* ? OR EXISTS (SELECT 1 FROM unnest(j.skills) s WHERE s ~* ?))', w);
    inTitle.push(`(j.title ~* $${params.length})::int`);
  }
  if (skill) add('? = ANY(j.skills)', skill);
  if (type) add('j.job_type = ?', type);
  const { rows } = await pool.query(
    `SELECT j.*, u.name AS employer_name FROM jobs j JOIN users u ON u.id = j.employer_id
     WHERE ${where.join(' AND ')}
     ORDER BY ${inTitle.length ? `${inTitle.join(' + ')} DESC, ` : ''}j.created_at DESC, j.id DESC LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
    params
  );
  return rows;
}

export const listForSitemap = async () => (await pool.query(`SELECT id, coalesce(updated_at, created_at) AS updated_at FROM jobs
  WHERE closed_at IS NULL AND NOT is_sample ORDER BY created_at DESC LIMIT 5000`)).rows;

export const findWithEmployer = async (id) => (await pool.query(
  'SELECT j.*, u.name AS employer_name FROM jobs j JOIN users u ON u.id = j.employer_id WHERE j.id = $1', [id])).rows[0];

// Jobs this employer posted this calendar month (Philippine time).
export const countPostedThisMonth = async (employerId, db = pool) => (await db.query(
  `SELECT count(*)::int AS n FROM jobs WHERE employer_id = $1 AND created_at >= ${MONTH_PH}`, [employerId])).rows[0].n;

// `values`: the cleaned fields from jobFields, in column order.
export const create = async (employerId, values, db = pool) => (await db.query(
  `INSERT INTO jobs (employer_id, title, description, skills, job_type, salary_min, salary_max, salary_period, max_applications)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
  [employerId, ...values])).rows[0];

// Lowering the limit to (or below) the applications already in closes the job, as reaching it would.
export const update = async (id, employerId, values) => (await pool.query(
  `UPDATE jobs SET title = $3, description = $4, skills = $5, job_type = $6, salary_min = $7, salary_max = $8, salary_period = $9,
     max_applications = $10, updated_at = now(),
     closed_at = CASE WHEN $10::int IS NOT NULL AND (SELECT count(*) FROM applications WHERE job_id = $1) >= $10 THEN coalesce(closed_at, now()) ELSE closed_at END
   WHERE id = $1 AND employer_id = $2 RETURNING *`,
  [id, employerId, ...values])).rows[0];

// The job's own application limit and how many it has received (for reopening it).
export const findLimits = async (id, employerId) => (await pool.query(
  'SELECT j.max_applications, (SELECT count(*)::int FROM applications a WHERE a.job_id = j.id) AS received FROM jobs j WHERE j.id = $1 AND j.employer_id = $2',
  [id, employerId])).rows[0];

export const setClosed = async (id, employerId, closed) => (await pool.query(
  'UPDATE jobs SET closed_at = CASE WHEN $3 THEN coalesce(closed_at, now()) END WHERE id = $1 AND employer_id = $2 RETURNING *',
  [id, employerId, closed])).rows[0];

export const remove = async (id, employerId) =>
  (await pool.query('DELETE FROM jobs WHERE id = $1 AND employer_id = $2', [id, employerId])).rowCount > 0;

// The employer's jobs with their applicant numbers and top 3 applicants (by credits), newest first.
export const listForEmployer = async (employerId) => (await pool.query(
  `SELECT j.*,
     (SELECT count(*)::int FROM applications a WHERE a.job_id = j.id) AS applicant_count,
     (SELECT count(*)::int FROM applications a WHERE a.job_id = j.id AND a.created_at > now() - interval '7 days') AS new_count,
     (SELECT count(*)::int FROM applications a WHERE a.job_id = j.id AND a.analysis IS NOT NULL) AS analyzed_count,
     (SELECT max(a.created_at) FROM applications a WHERE a.job_id = j.id) AS last_applied_at,
     (SELECT coalesce(json_agg(u.name ORDER BY t.credits DESC, t.created_at), '[]')
        FROM (SELECT worker_id, credits, created_at FROM applications WHERE job_id = j.id ORDER BY credits DESC, created_at LIMIT 3) t
        JOIN users u ON u.id = t.worker_id AND u.deleted_at IS NULL) AS top_applicants
   FROM jobs j WHERE employer_id = $1 ORDER BY created_at DESC`,
  [employerId])).rows;

export const isOwn = async (id, employerId) =>
  (await pool.query('SELECT 1 FROM jobs WHERE id = $1 AND employer_id = $2', [id, employerId])).rowCount > 0;

export const findTitle = async (id, employerId) =>
  (await pool.query('SELECT id, title FROM jobs WHERE id = $1 AND employer_id = $2', [id, employerId])).rows[0];
