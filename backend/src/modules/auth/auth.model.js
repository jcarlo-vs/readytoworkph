// Account queries for signing up, logging in, email codes and password resets.
import { pool } from '../../db/index.js';

// What the site gets back about the signed-in account.
export const USER_FIELDS = 'id, email, name, role, plan, photo_key IS NOT NULL AS has_photo, email_verified_at IS NOT NULL AS email_verified';

// --- Accounts ---

// Returns nothing when the email already has an account.
export const createWithPassword = async ({ email, passwordHash, name, role, first, last }) => (await pool.query(
  `INSERT INTO users (email, password_hash, name, role, first_name, last_name) VALUES ($1, $2, $3, $4, $5, $6)
   ON CONFLICT (email) DO NOTHING RETURNING ${USER_FIELDS}`,
  [email, passwordHash, name, role, first, last])).rows[0];

export const createWithGoogle = async ({ email, name, role, googleSub, first, last }) => (await pool.query(
  `INSERT INTO users (email, name, role, google_sub, email_verified_at, first_name, last_name) VALUES ($1, $2, $3, $4, now(), $5, $6) RETURNING ${USER_FIELDS}`,
  [email, name, role, googleSub, first, last])).rows[0];

export const createWorkerProfile = (userId) => pool.query('INSERT INTO worker_profiles (user_id) VALUES ($1)', [userId]);

export const findByGoogle = async (sub) => (await pool.query(`SELECT ${USER_FIELDS} FROM users WHERE google_sub = $1`, [sub])).rows[0];

// Links Google to the account with this email (not yet linked). An unconfirmed sign-up's password is removed
// and its other logins signed out (`had_password` says so).
export const linkGoogle = async (sub, email) => (await pool.query(
  `WITH old AS (SELECT id, password_hash IS NOT NULL AND email_verified_at IS NULL AS had_password FROM users WHERE email = $2 AND google_sub IS NULL)
   UPDATE users u SET google_sub = $1, email_verified_at = coalesce(u.email_verified_at, now()),
     password_hash = CASE WHEN old.had_password THEN NULL ELSE u.password_hash END,
     sessions_valid_from = CASE WHEN old.had_password THEN date_trunc('second', now()) ELSE u.sessions_valid_from END
   FROM old WHERE u.id = old.id
   RETURNING u.id, u.email, u.name, u.role, u.plan, u.photo_key IS NOT NULL AS has_photo, true AS email_verified, old.had_password`,
  [sub, email])).rows[0];

export const isSuspended = async (id) => (await pool.query('SELECT 1 FROM users WHERE id = $1 AND suspended_at IS NOT NULL', [id])).rowCount > 0;
export const isBlocked = async (emailHash) => (await pool.query('SELECT 1 FROM blocked_emails WHERE email_hash = $1', [emailHash])).rowCount > 0;

// True when it woke a paused account.
export const reactivate = async (id) => (await pool.query('UPDATE users SET deactivated_at = NULL WHERE id = $1 AND deactivated_at IS NOT NULL', [id])).rowCount > 0;

export const confirmEmail = async (id) => (await pool.query(
  `UPDATE users SET email_verified_at = coalesce(email_verified_at, now()) WHERE id = $1 RETURNING ${USER_FIELDS}`, [id])).rows[0];

// Throws Postgres' unique violation (23505) when another account has that email.
export const setEmail = async (id, email) => (await pool.query(`UPDATE users SET email = $2 WHERE id = $1 RETURNING ${USER_FIELDS}`, [id, email])).rows[0];

export const findForCode = async (id) => (await pool.query('SELECT id, name, email, email_verified_at FROM users WHERE id = $1', [id])).rows[0];

// --- Password logins ---

// The account with this email, with its wrong passwords in the last `lockMinutes` (`recent_fails`).
export const findForLogin = async (email, lockMinutes) => (await pool.query(
  `SELECT *, CASE WHEN failed_login_at > now() - interval '${lockMinutes} minutes' THEN failed_logins ELSE 0 END AS recent_fails
   FROM users WHERE email = $1`, [email])).rows[0];

export const pausePasswordLogin = (id, minutes) => pool.query(
  `UPDATE users SET failed_logins = 0, failed_login_at = NULL, login_locked_until = now() + interval '${minutes} minutes' WHERE id = $1`, [id]);
export const recordWrongPassword = (id, tries) => pool.query('UPDATE users SET failed_logins = $2, failed_login_at = now() WHERE id = $1', [id, tries]);
export const clearWrongPasswords = (id) => pool.query('UPDATE users SET failed_logins = 0, failed_login_at = NULL, login_locked_until = NULL WHERE id = $1', [id]);

// --- Password resets ---

export const findForReset = async (email) => (await pool.query("SELECT id, name, email FROM users WHERE email = $1 AND role <> 'team'", [email])).rows[0];

// Saves a reset link unless the account already has `maxLive` unexpired ones. True when saved.
export const createReset = async (tokenHash, userId, maxLive) => (await pool.query(
  `INSERT INTO password_resets (token_hash, user_id, expires_at) SELECT $1, $2, now() + interval '1 hour'
   WHERE (SELECT count(*) FROM password_resets WHERE user_id = $2 AND expires_at > now()) < $3`,
  [tokenHash, userId, maxLive])).rowCount > 0;

// Marks a live link used; returns its account id.
export const useReset = async (tokenHash) => (await pool.query(
  'UPDATE password_resets SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id',
  [tokenHash])).rows[0]?.user_id;

// A new password also ends any login pause, confirms the email (the link proved it), and signs out every other
// device: if someone else was in, they're out now.
export const setPassword = async (id, passwordHash) => (await pool.query(
  `UPDATE users SET password_hash = $2, failed_logins = 0, failed_login_at = NULL, login_locked_until = NULL,
     sessions_valid_from = date_trunc('second', now()), email_verified_at = coalesce(email_verified_at, now())
   WHERE id = $1 RETURNING ${USER_FIELDS}`,
  [id, passwordHash])).rows[0];

export const deleteResets = (userId) => pool.query('DELETE FROM password_resets WHERE user_id = $1', [userId]);

// --- 6-digit email codes (one per account) ---

export const saveCode = ({ userId, codeHash, purpose, newEmail }) => pool.query(
  `INSERT INTO email_codes (user_id, code_hash, purpose, new_email, expires_at) VALUES ($1, $2, $3, $4, now() + interval '10 minutes')
   ON CONFLICT (user_id) DO UPDATE SET code_hash = $2, purpose = $3, new_email = $4, tries = 0, sent_at = now(), expires_at = now() + interval '10 minutes'`,
  [userId, codeHash, purpose, newEmail]);

// Counts a try on the live code for this purpose and returns it, or nothing when there's none (expired, used up).
export const tryCode = async (userId, purpose, maxTries) => (await pool.query(
  `UPDATE email_codes SET tries = tries + 1 WHERE user_id = $1 AND purpose = $2 AND tries < $3 AND expires_at > now()
   RETURNING code_hash, tries, new_email`, [userId, purpose, maxTries])).rows[0];

export const hasLiveCode = async (userId, purpose, maxTries) => (await pool.query(
  'SELECT 1 FROM email_codes WHERE user_id = $1 AND purpose = $2 AND expires_at > now() AND tries < $3', [userId, purpose, maxTries])).rowCount > 0;

export const findCode = async (userId, purposes) => (await pool.query(
  'SELECT purpose, new_email FROM email_codes WHERE user_id = $1 AND purpose = ANY($2)', [userId, purposes])).rows[0];

export const deleteCodes = (userId, purpose = null) =>
  pool.query('DELETE FROM email_codes WHERE user_id = $1 AND ($2::text IS NULL OR purpose = $2)', [userId, purpose]);

// Seconds until another code may be sent (0 = now): at most one a minute.
export const secondsUntilNextCode = async (userId) => (await pool.query(
  `SELECT ceil(60 - extract(epoch FROM now() - sent_at))::int AS wait FROM email_codes WHERE user_id = $1 AND sent_at > now() - interval '1 minute'`,
  [userId])).rows[0]?.wait ?? 0;
