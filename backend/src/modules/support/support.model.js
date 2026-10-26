// Feedback and support tickets (the feedback table) and their conversations (support_messages).
import { pool } from '../../db/index.js';

// A ticket with who sent it: the account's name and email when they were signed in, else what they typed.
const SENDER = 'coalesce(u.email, f.email) AS email, coalesce(u.name, f.sender_name) AS name';

// --- Coming in ---

// `type`: idea, bug, other (feedback), support (Contact us) or email (sent to support@). Returns the new id.
export const create = async ({ userId = null, type, message, page = null, contactOk, email = null, senderName = null, subject = null, inboundId = null }) => (await pool.query(
  `INSERT INTO feedback (user_id, type, message, page, contact_ok, email, sender_name, subject, inbound_id)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (inbound_id) DO NOTHING RETURNING id`,
  [userId, type, message, page, contactOk, email, senderName, subject, inboundId])).rows[0]?.id;

// Who sent it, for the copy emailed to support@.
export const findSender = async (userId) => (await pool.query('SELECT name, email, role, plan FROM users WHERE id = $1', [userId])).rows[0];

// The active account with this email, for mail sent to support@.
export const findUserByEmail = async (email) =>
  (await pool.query('SELECT id FROM users WHERE lower(email) = $1 AND deleted_at IS NULL', [email])).rows[0]?.id;

// The ticket, if this address is the one that opened it.
export const findTicketFrom = async (id, email) => (await pool.query(
  'SELECT f.id FROM feedback f LEFT JOIN users u ON u.id = f.user_id WHERE f.id = $1 AND lower(coalesce(u.email, f.email)) = $2', [id, email])).rows[0];

// Their emailed answer; false when this email was already added (a redelivery).
export const addTheirReply = async (feedbackId, body, inboundId) => (await pool.query(
  'INSERT INTO support_messages (feedback_id, from_admin, body, inbound_id) VALUES ($1, false, $2, $3) ON CONFLICT (inbound_id) DO NOTHING',
  [feedbackId, body, inboundId])).rowCount > 0;

// --- The admin's side ---

// Open tickets first, newest first, with how many replies and whether they answered last.
export const list = async () => (await pool.query(
  `SELECT f.id, f.type, f.message, f.page, f.contact_ok, f.created_at, f.done_at, f.subject, ${SENDER}, u.role,
     (SELECT count(*)::int FROM support_messages m WHERE m.feedback_id = f.id) AS replies,
     (SELECT NOT m.from_admin FROM support_messages m WHERE m.feedback_id = f.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS they_replied_last
   FROM feedback f LEFT JOIN users u ON u.id = f.user_id
   ORDER BY f.done_at IS NOT NULL, f.created_at DESC LIMIT 200`)).rows;

export const find = async (id) => (await pool.query(
  `SELECT f.id, f.type, f.subject, f.message, f.page, f.contact_ok, f.created_at, f.done_at, ${SENDER}, u.role, u.id AS user_id
   FROM feedback f LEFT JOIN users u ON u.id = f.user_id WHERE f.id = $1`, [id])).rows[0];

// What they first wrote comes from the ticket; these are the replies after it, in order.
export const listMessages = async (feedbackId) => (await pool.query(
  'SELECT id, from_admin, body, created_at FROM support_messages WHERE feedback_id = $1 ORDER BY created_at, id', [feedbackId])).rows;

export const addOurReply = (feedbackId, body) =>
  pool.query('INSERT INTO support_messages (feedback_id, from_admin, body) VALUES ($1, true, $2)', [feedbackId, body]);

// Done, or open again. False when there's no such ticket.
export const setDone = async (id, done) =>
  (await pool.query('UPDATE feedback SET done_at = CASE WHEN $2 THEN now() END WHERE id = $1', [id, done])).rowCount > 0;
