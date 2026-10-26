// The settings table: what the admin changed in Admin › Settings (see services/settings.js for the keys).
import { pool } from '../db/index.js';

export const readAll = async () => (await pool.query('SELECT key, value FROM settings')).rows;

export const save = (key, value) => pool.query(
  'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()', [key, JSON.stringify(value)]);
