// Sample-job queries: the made-up employers, their jobs (is_sample), and the autopilot's day plan, kept in the
// settings table under sample_jobs_plan.
import { pool } from '../../db/index.js';

// Creates (or renames) one employer per email and returns their ids.
export const upsertEmployers = async (emails, names, db = pool) => (await db.query(
  `INSERT INTO users (email, name, role, email_verified_at, plan)
   SELECT e, n, 'employer', now(), 'premium' FROM unnest($1::text[], $2::text[]) AS t(e, n)
   ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, plan = 'premium' RETURNING id`,
  [emails, names])).rows.map((r) => r.id);

// `at`: when it says it was posted (milliseconds).
export const createJob = (employerId, j, at, db = pool) => db.query(
  `INSERT INTO jobs (employer_id, title, description, skills, job_type, salary_min, salary_max, salary_period, created_at, is_sample)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, to_timestamp($9 / 1000.0), true)`,
  [employerId, j.title, j.description, j.skills, j.job_type, j.salary_min, j.salary_max, j.salary_period, at]);

// The latest sample job titles, to avoid repeating a role too soon.
export const recentTitles = async (db = pool) =>
  (await db.query('SELECT title FROM jobs WHERE is_sample ORDER BY created_at DESC LIMIT 200')).rows.map((r) => r.title);
export const countJobs = async () => (await pool.query('SELECT count(*)::int AS n FROM jobs WHERE is_sample AND closed_at IS NULL')).rows[0].n;
// Sample jobs nobody applied to are deleted; ones real workers applied to are closed instead, so their
// applications (and the job page they link to) stay.
export async function removeJobs() {
  const applied = 'EXISTS (SELECT 1 FROM applications a WHERE a.job_id = jobs.id)';
  const closed = (await pool.query(`UPDATE jobs SET closed_at = now() WHERE is_sample AND closed_at IS NULL AND ${applied}`)).rowCount;
  const deleted = (await pool.query(`DELETE FROM jobs WHERE is_sample AND NOT ${applied}`)).rowCount;
  return { deleted, closed };
}

// Today's plan ({ day, per_day, times, posted }), or {} before the first one.
export const findPlan = async () => (await pool.query(`SELECT value FROM settings WHERE key = 'sample_jobs_plan'`)).rows[0]?.value ?? {};

// The plan, locked until the transaction ends, so two servers can't post the same job twice.
export async function lockPlan(db) {
  await db.query(`INSERT INTO settings (key, value) VALUES ('sample_jobs_plan', '{}') ON CONFLICT DO NOTHING`);
  return (await db.query(`SELECT value FROM settings WHERE key = 'sample_jobs_plan' FOR UPDATE`)).rows[0].value;
}

// Keeps what was posted today and drops the times still ahead.
export const stopPlan = () => pool.query(`UPDATE settings SET value = jsonb_set(jsonb_set(value, '{per_day}', '0'),
  '{times}', coalesce((SELECT jsonb_agg(t) FROM jsonb_array_elements(value->'times') WITH ORDINALITY x(t, i) WHERE i <= (value->>'posted')::int), '[]'))
  WHERE key = 'sample_jobs_plan'`);

export const savePlan = (plan, db) =>
  db.query(`UPDATE settings SET value = $1, updated_at = now() WHERE key = 'sample_jobs_plan'`, [JSON.stringify(plan)]);
