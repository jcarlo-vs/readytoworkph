// Admin panel queries: users, job posts, the dashboard, paying employers, and the admin's action history.
import { pool } from '../../db/index.js';

// --- Action history ---

export const logAction = (action, userId, detail) =>
  pool.query('INSERT INTO admin_actions (action, user_id, detail) VALUES ($1, $2, $3)', [action, userId, detail]);

// --- Users ---

// `search` is a LIKE pattern ('%%' = everyone); `role` and `plan` '' = any. Newest first; `total` counts every match.
export async function listUsers({ search, role, plan, offset, size }) {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.plan, u.created_at, u.last_seen_at, u.last_country, u.google_sub IS NOT NULL AS google, u.suspended_at,
       (SELECT count(*)::int FROM jobs j WHERE j.employer_id = u.id) AS jobs,
       (SELECT count(*)::int FROM applications a WHERE a.worker_id = u.id) AS applications,
       count(*) OVER ()::int AS total
     FROM users u
     WHERE u.deleted_at IS NULL AND u.role <> 'team' AND ($1 = '%%' OR u.name ILIKE $1 OR u.email ILIKE $1) AND ($2 = '' OR u.role = $2) AND ($3 = '' OR (u.role = 'employer' AND u.plan = $3))
     ORDER BY u.created_at DESC LIMIT $5 OFFSET $4`,
    [search, role, plan, offset, size]);
  return { users: rows.map(({ total: _, ...u }) => u), total: rows[0]?.total ?? 0 };
}

// The account the admin is fixing.
export const findTarget = async (id) => (await pool.query(
  'SELECT id, name, email, role, plan, email_verified_at, deleted_at, paddle_subscription_id FROM users WHERE id = $1', [id])).rows[0];

// Everything on one user's admin page.
export const findDetail = async (id) => (await pool.query(
  `SELECT id, email, name, role, plan, plan_changed_at, created_at, last_seen_at, last_country, google_sub IS NOT NULL AS google,
     password_hash IS NOT NULL AS has_password, email_verified_at, suspended_at, deactivated_at, deleted_at, announcements_off_at,
     paddle_subscription_id IS NOT NULL AS paddle
   FROM users WHERE id = $1`, [id])).rows[0];

// Their latest jobs, applications, message counts, support tickets (by account or email) and admin actions.
export async function findActivity(id, email) {
  const [jobs, applications, messages, tickets, actions] = await Promise.all([
    pool.query(`SELECT j.id, j.title, j.created_at, j.closed_at, (SELECT count(*)::int FROM applications a WHERE a.job_id = j.id) AS applicants
       FROM jobs j WHERE j.employer_id = $1 ORDER BY j.created_at DESC LIMIT 20`, [id]),
    pool.query(`SELECT a.id, a.created_at, a.credits, j.id AS job_id, j.title AS job_title, e.name AS employer
       FROM applications a JOIN jobs j ON j.id = a.job_id JOIN users e ON e.id = j.employer_id WHERE a.worker_id = $1 ORDER BY a.created_at DESC LIMIT 20`, [id]),
    pool.query(`SELECT count(*) FILTER (WHERE sender_id = $1)::int AS sent, count(*) FILTER (WHERE recipient_id = $1)::int AS received
       FROM messages WHERE sender_id = $1 OR recipient_id = $1`, [id]),
    pool.query(`SELECT id, type, coalesce(subject, left(message, 80)) AS subject, created_at, done_at FROM feedback
       WHERE user_id = $1 OR lower(email) = lower($2) ORDER BY created_at DESC LIMIT 20`, [id, email]),
    pool.query('SELECT at, action, detail FROM admin_actions WHERE user_id = $1 ORDER BY at DESC LIMIT 30', [id]),
  ]);
  return { jobs: jobs.rows, applications: applications.rows, messages: messages.rows[0], tickets: tickets.rows, actions: actions.rows };
}

// A worker or employer account that isn't deleted (for "Log in as"), and whether it's suspended.
export const findPerson = async (id) => (await pool.query(
  `SELECT id, role, suspended_at IS NOT NULL AS suspended FROM users WHERE id = $1 AND deleted_at IS NULL AND role IN ('worker', 'employer')`, [id])).rows[0];

// Suspending also signs them out everywhere. Returns their email and the new state, or nothing if there's no such account.
export const setSuspended = async (id, on) => (await pool.query(
  `UPDATE users SET suspended_at = CASE WHEN $2 THEN coalesce(suspended_at, now()) END,
     sessions_valid_from = CASE WHEN $2 THEN now() + interval '1 second' ELSE sessions_valid_from END
   WHERE id = $1 AND deleted_at IS NULL RETURNING email, suspended_at`, [id, on])).rows[0];

// A blocked email (kept only as a one-way hash) can't sign up again.
export const blockEmail = (emailHash) => pool.query('INSERT INTO blocked_emails (email_hash) VALUES ($1) ON CONFLICT DO NOTHING', [emailHash]);
export const unblockEmail = (emailHash) => pool.query('DELETE FROM blocked_emails WHERE email_hash = $1', [emailHash]);

export async function confirmEmail(id) {
  await pool.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [id]);
  await pool.query("DELETE FROM email_codes WHERE user_id = $1 AND purpose = 'confirm'", [id]);
}

export const setPlan = (id, plan) => pool.query('UPDATE users SET plan = $2 WHERE id = $1', [id, plan]);

// --- Job posts ---

// `search` is a LIKE pattern on the title or employer; `status` 'open', 'closed' or '' (all). Newest first.
export async function listJobs({ search, status, offset, size }) {
  const { rows } = await pool.query(
    `SELECT j.id, j.title, j.job_type, j.created_at, j.closed_at, j.is_sample, u.id AS employer_id, u.name AS employer_name, u.email AS employer_email, u.plan,
       (SELECT count(*)::int FROM applications a WHERE a.job_id = j.id) AS applicants,
       count(*) OVER ()::int AS total
     FROM jobs j JOIN users u ON u.id = j.employer_id
     WHERE ($1 = '%%' OR j.title ILIKE $1 OR u.name ILIKE $1 OR u.email ILIKE $1)
       AND ($2 = '' OR ($2 = 'open' AND j.closed_at IS NULL) OR ($2 = 'closed' AND j.closed_at IS NOT NULL))
     ORDER BY j.created_at DESC LIMIT $4 OFFSET $3`,
    [search, status, offset, size]);
  return { jobs: rows.map(({ total: _, ...j }) => j), total: rows[0]?.total ?? 0 };
}

// Returns the job's employer and title, or nothing if there's no such job.
export const setJobClosed = async (id, closed) => (await pool.query(
  'UPDATE jobs SET closed_at = CASE WHEN $2 THEN coalesce(closed_at, now()) END WHERE id = $1 RETURNING employer_id, title', [id, closed])).rows[0];

// --- Paying employers ---

// The sample-job employers (…@seed.test, on Premium) are made up, so they stay out of the numbers.
const REAL = "email NOT LIKE '%@seed.test'";

export const listPaying = async () => (await pool.query(
  `SELECT id, name, email, plan, plan_changed_at, paddle_subscription_id FROM users
   WHERE role = 'employer' AND plan <> 'free' AND ${REAL} ORDER BY plan_changed_at DESC NULLS LAST`)).rows;

export const countEmployers = async () =>
  (await pool.query("SELECT count(*)::int AS n FROM users WHERE role = 'employer' AND deleted_at IS NULL")).rows[0].n;

// --- Dashboard ---

// Site-wide totals, sign-ups per Philippine day for 30 days, active users' countries, and the newest accounts.
// Deleted accounts, the Team account and the sample employers aren't counted, nor sample jobs.
// "Active" means signed in and using the site.
export async function dashboard() {
  const live = (sql) => sql.replace(/FROM users( WHERE)?/, (_, where) => `FROM users WHERE deleted_at IS NULL AND role <> 'team' AND ${REAL}${where ? ' AND' : ''}`);
  const count = (sql) => `(SELECT count(*)::int ${live(sql)})`;
  const since = (col, period) => `${col} > now() - interval '${period}'`;
  const { rows: [totals] } = await pool.query(`SELECT
    ${count("FROM users")} AS users,
    ${count("FROM users WHERE role = 'worker'")} AS workers,
    ${count("FROM users WHERE role = 'employer'")} AS employers,
    ${count(`FROM users WHERE ${since('created_at', '1 day')}`)} AS new_24h,
    ${count(`FROM users WHERE ${since('created_at', '7 days')}`)} AS new_7d,
    ${count("FROM users WHERE google_sub IS NOT NULL")} AS google_users,
    ${count("FROM users WHERE role = 'employer' AND plan <> 'free'")} AS paid_employers,
    ${count(`FROM users WHERE ${since('last_seen_at', '5 minutes')}`)} AS active_now,
    ${count(`FROM users WHERE ${since('last_seen_at', '1 day')}`)} AS active_24h,
    ${count(`FROM users WHERE ${since('last_seen_at', '7 days')}`)} AS active_7d,
    ${count("FROM worker_profiles WHERE title <> ''")} AS profiles_completed,
    ${count("FROM worker_profiles WHERE resume_key IS NOT NULL")} AS resumes,
    (SELECT count(DISTINCT worker_id)::int FROM applications) AS workers_applied,
    ${count("FROM applications")} AS applications,
    ${count(`FROM applications WHERE ${since('created_at', '7 days')}`)} AS applications_7d,
    ${count("FROM ai_analyses")} AS ai_analyses,
    ${count(`FROM ai_analyses WHERE ${since('created_at', '7 days')}`)} AS ai_analyses_7d,
    ${count("FROM feedback WHERE done_at IS NULL")} AS open_feedback,
    (SELECT count(*)::int FROM messages WHERE read_at IS NULL AND recipient_id = (SELECT id FROM users WHERE role = 'team')) AS team_unread,
    (SELECT count(DISTINCT employer_id)::int FROM jobs WHERE NOT is_sample) AS employers_posted,
    ${count("FROM jobs WHERE NOT is_sample")} AS jobs,
    ${count("FROM jobs WHERE NOT is_sample AND closed_at IS NULL")} AS open_jobs,
    ${count(`FROM jobs WHERE NOT is_sample AND ${since('created_at', '7 days')}`)} AS jobs_7d,
    ${count("FROM messages")} AS messages,
    ${count(`FROM messages WHERE ${since('created_at', '7 days')}`)} AS messages_7d`);
  const { rows: signups } = await pool.query(`SELECT to_char(d, 'YYYY-MM-DD') AS day,
      count(u.id) FILTER (WHERE u.role = 'worker')::int AS workers,
      count(u.id) FILTER (WHERE u.role = 'employer')::int AS employers
    FROM generate_series((now() AT TIME ZONE 'Asia/Manila')::date - 29, (now() AT TIME ZONE 'Asia/Manila')::date, interval '1 day') d
    LEFT JOIN users u ON (u.created_at AT TIME ZONE 'Asia/Manila')::date = d::date AND u.role <> 'team' AND u.${REAL}
    GROUP BY d ORDER BY d`);
  const { rows: countries } = await pool.query(`SELECT coalesce(last_country, '??') AS country, count(*)::int AS users
    FROM users WHERE deleted_at IS NULL AND ${since('last_seen_at', '30 days')} GROUP BY 1 ORDER BY 2 DESC LIMIT 15`);
  const { rows: recent } = await pool.query(`SELECT id, name, role, created_at, last_seen_at, last_country FROM users WHERE deleted_at IS NULL AND role <> 'team' AND ${REAL} ORDER BY created_at DESC LIMIT 10`);
  return { totals, signups, countries, recent };
}
