// Message queries: conversations between employers and workers, and the Team account's conversations.
import { pool } from '../../db/index.js';
import { RANK } from '../../services/plans.js';

// Why an account can't get messages right now: 'deleted', 'suspended', 'deactivated' (paused), or null.
const STATUS = `CASE WHEN u.deleted_at IS NOT NULL THEN 'deleted' WHEN u.suspended_at IS NOT NULL THEN 'suspended' WHEN u.deactivated_at IS NOT NULL THEN 'deactivated' END`;

export const findPerson = async (id) => (await pool.query(`SELECT u.id, u.name, u.email, u.role, ${STATUS} AS status FROM users u WHERE u.id = $1`, [id])).rows[0];

export const findTeam = async () => (await pool.query("SELECT id, name FROM users WHERE role = 'team'")).rows[0];

// --- Inbox ---

// One row per person this user has exchanged messages with, newest first, without the ones they removed
// (until a newer message arrives).
export const inbox = async (userId) => (await pool.query(
  `WITH m AS (
     SELECT CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS other, sender_id, body, created_at
     FROM messages WHERE sender_id = $1 OR recipient_id = $1
   ), latest AS (SELECT DISTINCT ON (other) * FROM m ORDER BY other, created_at DESC)
   SELECT l.other AS user_id, u.name, u.role, u.deleted_at IS NOT NULL AS deleted, u.deactivated_at IS NOT NULL AS deactivated, l.body AS last_body, l.created_at AS last_at, l.sender_id = $1 AS last_from_me,
     (SELECT count(*)::int FROM messages x WHERE x.sender_id = l.other AND x.recipient_id = $1 AND x.read_at IS NULL) AS unread
   FROM latest l JOIN users u ON u.id = l.other
   LEFT JOIN hidden_conversations h ON h.user_id = $1 AND h.other_id = l.other
   WHERE h.hidden_at IS NULL OR l.created_at > h.hidden_at
   ORDER BY l.created_at DESC`,
  [userId])).rows;

// The Team account's conversations, newest first.
export const teamInbox = async (teamId) => (await pool.query(
  `SELECT DISTINCT ON (m.other) m.other AS user_id, u.name, u.email, u.role, m.body AS last_body, m.created_at AS last_at, m.from_team,
     (SELECT count(*)::int FROM messages x WHERE x.sender_id = m.other AND x.recipient_id = $1 AND x.read_at IS NULL) AS unread
   FROM (SELECT CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS other, body, created_at, sender_id = $1 AS from_team
         FROM messages WHERE sender_id = $1 OR recipient_id = $1) m
   JOIN users u ON u.id = m.other ORDER BY m.other, m.created_at DESC`, [teamId])).rows.sort((a, b) => b.last_at - a.last_at);

// Removes these conversations from the user's list; their unread messages count as read.
export async function hide(userId, otherIds) {
  await pool.query(`INSERT INTO hidden_conversations (user_id, other_id) SELECT $1, u.id FROM users u WHERE u.id = ANY($2)
    ON CONFLICT (user_id, other_id) DO UPDATE SET hidden_at = now()`, [userId, otherIds]);
  await pool.query('UPDATE messages SET read_at = now() WHERE recipient_id = $1 AND sender_id = ANY($2) AND read_at IS NULL', [userId, otherIds]);
}

export const countUnread = async (userId) =>
  (await pool.query('SELECT count(*)::int AS count FROM messages WHERE recipient_id = $1 AND read_at IS NULL', [userId])).rows[0];

// --- One conversation ---

// Everything `from` sent `to` and hasn't been read yet now counts as read.
export const markRead = (fromId, toId) =>
  pool.query('UPDATE messages SET read_at = now() WHERE sender_id = $1 AND recipient_id = $2 AND read_at IS NULL', [fromId, toId]);

// Oldest first, with the job each message is about.
export const conversation = async (userId, otherId) => (await pool.query(
  `SELECT m.id, m.sender_id, m.body, m.created_at, m.read_at, m.job_id, j.title AS job_title
   FROM messages m LEFT JOIN jobs j ON j.id = m.job_id
   WHERE (m.sender_id = $1 AND m.recipient_id = $2) OR (m.sender_id = $2 AND m.recipient_id = $1)
   ORDER BY m.created_at, m.id`,
  [userId, otherId])).rows;

export const teamConversation = async (teamId, userId) => (await pool.query(
  `SELECT id, sender_id = $1 AS from_team, body, created_at, read_at FROM messages
   WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1) ORDER BY created_at, id`, [teamId, userId])).rows;

export const workerHeadline = async (workerId) =>
  (await pool.query('SELECT title, hourly_rate FROM worker_profiles WHERE user_id = $1', [workerId])).rows[0];

// Each of these workers' applications to this employer's jobs (only the ones their plan shows), newest first.
export const applicationsTo = async (employerId, workerIds, limit) => (await pool.query(
  `SELECT a.worker_id, a.id AS application_id, a.job_id, j.title, a.created_at, a.credits, (a.analysis->>'score')::int AS score, a.created_at > now() - interval '3 days' AS recent,
     EXISTS (SELECT 1 FROM hires h WHERE h.employer_id = $2 AND h.worker_id = a.worker_id AND h.job_id = a.job_id) AS hired,
     EXISTS (SELECT 1 FROM messages m WHERE m.sender_id = $2 AND m.recipient_id = a.worker_id AND m.job_id = a.job_id) AS messaged
   FROM applications a JOIN jobs j ON j.id = a.job_id
   WHERE a.worker_id = ANY($1) AND j.employer_id = $2 AND ($3::int IS NULL OR ${RANK} < $3)
   ORDER BY a.created_at DESC`, [workerIds, employerId, limit])).rows;

// --- Who may write ---

// The worker applied to one of the employer's jobs, or the two already have a conversation.
export const employerKnowsWorker = async (employerId, workerId) => (await pool.query(
  `SELECT 1 FROM applications a JOIN jobs j ON j.id = a.job_id WHERE j.employer_id = $1 AND a.worker_id = $2
   UNION ALL
   SELECT 1 FROM messages WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)
   LIMIT 1`,
  [employerId, workerId])).rowCount > 0;

export const hasWritten = async (fromId, toId) =>
  (await pool.query('SELECT 1 FROM messages WHERE sender_id = $1 AND recipient_id = $2 LIMIT 1', [fromId, toId])).rowCount > 0;

// The applicants behind these applications (one row per worker, their latest application), with whether they
// can get messages.
export const bulkRecipients = async (applicationIds, employerId, limit) => (await pool.query(
  `SELECT DISTINCT ON (a.worker_id) a.worker_id, a.job_id, j.title AS job_title, u.name, u.email, ${STATUS} AS status
   FROM applications a JOIN jobs j ON j.id = a.job_id JOIN users u ON u.id = a.worker_id
   WHERE a.id = ANY($1) AND j.employer_id = $2 AND ($3::int IS NULL OR ${RANK} < $3)
   ORDER BY a.worker_id, a.created_at DESC`, [applicationIds, employerId, limit])).rows;

// --- Sending ---

// Whether the recipient already has unread messages from this sender, is on the site right now (active in the
// last `onlineMinutes`), and wants message emails.
export const deliveryState = async (senderId, recipientId, onlineMinutes) => (await pool.query(
  `SELECT EXISTS (SELECT 1 FROM messages WHERE sender_id = $1 AND recipient_id = $2 AND read_at IS NULL) AS "alreadyUnread",
     coalesce(u.last_seen_at > now() - interval '${onlineMinutes} minutes', false) AS online, u.message_emails AS "wantsEmail"
   FROM users u WHERE u.id = $2`,
  [senderId, recipientId])).rows[0];

export const create = async ({ senderId, recipientId, jobId, body }) => (await pool.query(
  `INSERT INTO messages (sender_id, recipient_id, job_id, body) VALUES ($1, $2, $3, $4)
   RETURNING id, sender_id, body, created_at, read_at, job_id`,
  [senderId, recipientId, jobId, body])).rows[0];
