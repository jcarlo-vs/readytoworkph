// Public numbers for the homepage.
import { pool } from '../../db/index.js';

// Jobs posted, workers with a profile, employers (not the sample-job ones), and employers who upgraded this month
// (Philippine time).
export const stats = async () => (await pool.query(`SELECT
  (SELECT count(*)::int FROM jobs) AS jobs,
  (SELECT count(*)::int FROM worker_profiles WHERE title <> '') AS workers,
  (SELECT count(*)::int FROM users WHERE role = 'employer' AND deleted_at IS NULL AND email NOT LIKE '%@seed.test') AS employers,
  (SELECT count(*)::int FROM users WHERE role = 'employer' AND plan <> 'free'
     AND plan_changed_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila') AS upgraded_this_month`)).rows[0];
