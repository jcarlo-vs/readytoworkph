// Queries on the users table that many features share. Functions that can run inside a transaction take
// its connection (`db`) as the last argument.
import { pool } from '../db/index.js';

export const findContact = async (id, db = pool) =>
  (await db.query('SELECT id, name, email, role FROM users WHERE id = $1', [id])).rows[0];

// Locks the account's row until the transaction ends, so parallel requests for it wait their turn
// (monthly limits, credits, quotas).
export const lockUser = (id, db) => db.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [id]);

export const findPlan = async (id, db = pool) => (await db.query('SELECT plan FROM users WHERE id = $1', [id])).rows[0]?.plan ?? 'free';

// Who a login belongs to now: its role, whether the email is confirmed, and from when its logins count
// (`since`, seconds; logins issued earlier were signed out).
export const findForSession = async (id) => (await pool.query(
  'SELECT role, email_verified_at IS NOT NULL AS verified, floor(extract(epoch FROM sessions_valid_from))::bigint AS since FROM users WHERE id = $1', [id])).rows[0];

// Last active, and the country it was from (no IP is kept).
export const touchLastSeen = (id, country) =>
  pool.query('UPDATE users SET last_seen_at = now(), last_country = coalesce($2, last_country) WHERE id = $1', [id, country]);
