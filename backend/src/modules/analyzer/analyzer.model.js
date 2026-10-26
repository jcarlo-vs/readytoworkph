// Smart Score queries: what the AI reads about an application, saving its answer, and counting runs.
import { MONTH_PH } from '../../config.js';
import { pool } from '../../db/index.js';
import { RANK } from '../../services/plans.js';

// The application with its job and the applicant's profile; `rank` is their place in line, and `resume_text` is
// null when no resume was attached ('' when it couldn't be read).
export const findForScoring = async (id, employerId) => (await pool.query(
  `SELECT a.id, a.cover_letter, a.analysis, ${RANK} AS rank, j.title, j.description, j.skills AS job_skills, j.job_type,
     p.title AS worker_title, p.bio, p.skills AS worker_skills, p.hourly_rate, p.availability,
     CASE WHEN a.resume_attached THEN coalesce(p.resume_text, '') END AS resume_text
   FROM applications a JOIN jobs j ON j.id = a.job_id LEFT JOIN worker_profiles p ON p.user_id = a.worker_id
   WHERE a.id = $1 AND j.employer_id = $2`,
  [id, employerId])).rows[0];

// The employer's plan and Smart Scores this calendar month (Philippine time), re-scores included.
export const usageThisMonth = async (employerId, db = pool) => (await db.query(
  `SELECT u.plan, (SELECT count(*)::int FROM ai_analyses WHERE employer_id = u.id AND created_at >= ${MONTH_PH}) AS used
   FROM users u WHERE u.id = $1`,
  [employerId])).rows[0];

// Saves a score; a first score only if none was saved meanwhile (`replace` false). Returns it, or nothing.
export const saveScore = async (applicationId, analysis, replace, db = pool) => (await db.query(
  `UPDATE applications SET analysis = $2, analyzed_at = now() WHERE id = $1 ${replace ? '' : 'AND analysis IS NULL'} RETURNING analysis`,
  [applicationId, analysis])).rows[0]?.analysis;

// One AI run, counted against the monthly allowance.
export const countRun = (employerId, applicationId, db = pool) =>
  db.query('INSERT INTO ai_analyses (employer_id, application_id) VALUES ($1, $2)', [employerId, applicationId]);

export const findScore = async (applicationId, db = pool) =>
  (await db.query('SELECT analysis FROM applications WHERE id = $1', [applicationId])).rows[0].analysis;
