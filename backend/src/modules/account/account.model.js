// Queries for the signed-in person's own account.
import { pool } from '../../db/index.js';
import { USER_FIELDS } from '../auth/auth.model.js';

export const findMe = async (id) => (await pool.query(`SELECT ${USER_FIELDS},
  google_sub IS NOT NULL AS has_google, password_hash IS NOT NULL AS has_password, first_name, last_name, message_emails FROM users WHERE id = $1`, [id])).rows[0];

export const findWithPassword = async (id) => (await pool.query('SELECT id, name, email, password_hash FROM users WHERE id = $1', [id])).rows[0];

export const emailTaken = async (email) => (await pool.query('SELECT 1 FROM users WHERE email = $1', [email])).rowCount > 0;

// Switches the sign-in email and signs out every other device. Throws Postgres' unique violation (23505) when
// another account took that email meanwhile.
export const changeEmail = async (id, email) => (await pool.query(
  `UPDATE users SET email = $2, sessions_valid_from = date_trunc('second', now()) WHERE id = $1 RETURNING ${USER_FIELDS}`,
  [id, email])).rows[0];

export const updateName = async (id, { name, first, last }) => (await pool.query(
  `UPDATE users SET name = $2, first_name = $3, last_name = $4 WHERE id = $1 RETURNING ${USER_FIELDS}`,
  [id, name, first, last])).rows[0];

export const setMessageEmails = (id, on) => pool.query('UPDATE users SET message_emails = $2 WHERE id = $1', [id, on]);

// Paused: hidden, and signed out everywhere (logging in again reactivates it).
export const deactivate = (id) =>
  pool.query(`UPDATE users SET deactivated_at = now(), sessions_valid_from = now() + interval '1 second' WHERE id = $1`, [id]);

// What deleting the account has to clean up outside the database.
export const findForDeletion = async (id) => (await pool.query(
  'SELECT u.photo_key, u.paddle_subscription_id, p.resume_key FROM users u LEFT JOIN worker_profiles p ON p.user_id = u.id WHERE u.id = $1', [id])).rows[0];

// Removes the account's data in one transaction. The user row becomes a blank placeholder so the other side of a
// conversation still reads "Deleted user".
export async function erase(id) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    for (const sql of [
      'DELETE FROM jobs WHERE employer_id = $1', // and, with them, their applications
      // A worker's applications stay as anonymous rows ("An applicant deleted their account"), so employers'
      // counts and rankings still add up; what they wrote, their resume and the AI analysis are removed.
      'UPDATE applications SET cover_letter = \'\', analysis = NULL, analyzed_at = NULL, resume_attached = false WHERE worker_id = $1',
      'DELETE FROM worker_profiles WHERE user_id = $1',
      'DELETE FROM saved_workers WHERE employer_id = $1 OR worker_id = $1',
      'DELETE FROM hires WHERE employer_id = $1', // an employer's own list goes; a worker stays in theirs as "Deleted user"
      'DELETE FROM password_resets WHERE user_id = $1',
      'DELETE FROM email_codes WHERE user_id = $1',
      `UPDATE users SET name = 'Deleted user', first_name = '', last_name = '', email = 'deleted-' || id || '@deleted.invalid', password_hash = NULL, google_sub = NULL,
         photo_key = NULL, plan = 'free', paddle_customer_id = NULL, paddle_subscription_id = NULL, last_country = NULL,
         email_verified_at = NULL, deleted_at = now(), sessions_valid_from = now() + interval '1 second' WHERE id = $1`,
    ]) await db.query(sql, [id]);
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
}
