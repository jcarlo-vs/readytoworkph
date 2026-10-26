// Where uploaded files are recorded: a worker's resume on their profile, a profile photo on the account.
import { pool } from '../../db/index.js';

export const findResume = async (userId) => (await pool.query(
  'SELECT resume_key, resume_name, resume_uploaded_at FROM worker_profiles WHERE user_id = $1', [userId])).rows[0];

// Saves the new resume and its text (read once, for the Smart Score); returns the file it replaced, if any.
export async function setResume(userId, { key, name, text }) {
  const old = await findResume(userId);
  const { rows: [p] } = await pool.query(
    `UPDATE worker_profiles SET resume_key = $2, resume_name = $3, resume_uploaded_at = now(), resume_text = $4 WHERE user_id = $1
     RETURNING resume_name, resume_uploaded_at`,
    [userId, key, name, text]);
  return { saved: p, oldKey: old?.resume_key };
}

// Returns the removed file's key.
export async function removeResume(userId) {
  const old = await findResume(userId);
  await pool.query('UPDATE worker_profiles SET resume_key = NULL, resume_name = NULL, resume_uploaded_at = NULL, resume_text = NULL WHERE user_id = $1', [userId]);
  return old?.resume_key;
}

export const findPhoto = async (userId) => (await pool.query('SELECT photo_key FROM users WHERE id = $1', [userId])).rows[0]?.photo_key;

// `key` null removes it. Returns the file it replaced.
export async function setPhoto(userId, key) {
  const old = await findPhoto(userId);
  await pool.query('UPDATE users SET photo_key = $2 WHERE id = $1', [userId, key]);
  return old;
}
