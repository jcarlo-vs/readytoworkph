// Announcement emails (Admin › Announcements): who can get them, and the history of sends.
import { pool } from '../../db/index.js';

// Who each audience is (users columns), and who we can and may email at all: confirmed, active, not opted out.
export const AUDIENCES = { employers: "role = 'employer'", workers: "role = 'worker'", everyone: "role IN ('employer', 'worker')" };

// The sample-job employers (…@seed.test) can't get mail, so they don't count.
export const REACHABLE = `deleted_at IS NULL AND suspended_at IS NULL AND deactivated_at IS NULL AND email_verified_at IS NOT NULL AND announcements_off_at IS NULL
  AND email NOT LIKE '%@seed.test'`;

export const countReachable = async () => (await pool.query(`SELECT count(*) FILTER (WHERE role = 'employer')::int AS employers,
  count(*) FILTER (WHERE role = 'worker')::int AS workers, count(*) FILTER (WHERE role <> 'team')::int AS everyone FROM users WHERE ${REACHABLE}`)).rows[0];

export const listRecipients = async (audience) =>
  (await pool.query(`SELECT id, name, email FROM users WHERE ${REACHABLE} AND ${AUDIENCES[audience]} ORDER BY id`)).rows;

export const listHistory = async () => (await pool.query(
  'SELECT id, audience, subject, body, recipients, sent, failed, created_at, finished_at FROM broadcasts ORDER BY created_at DESC LIMIT 20')).rows;

export const sentRecently = async (subject, body) => (await pool.query(
  `SELECT 1 FROM broadcasts WHERE subject = $1 AND body = $2 AND created_at > now() - interval '10 minutes'`, [subject, body])).rowCount > 0;

export const create = async ({ audience, subject, body, recipients }) => (await pool.query(
  'INSERT INTO broadcasts (audience, subject, body, recipients) VALUES ($1, $2, $3, $4) RETURNING id', [audience, subject, body, recipients])).rows[0].id;

export const saveProgress = (id, sent, failed) => pool.query('UPDATE broadcasts SET sent = $2, failed = $3 WHERE id = $1', [id, sent, failed]);
export const finish = (id) => pool.query('UPDATE broadcasts SET finished_at = now() WHERE id = $1', [id]);

// The unsubscribe link: `on` subscribes again.
export const setAnnouncements = (userId, on) => pool.query(
  'UPDATE users SET announcements_off_at = CASE WHEN $2 THEN NULL ELSE coalesce(announcements_off_at, now()) END WHERE id = $1', [userId, on]);
