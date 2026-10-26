// Shared by the admin pages: the action history, and finding the account being fixed.
import { num } from '../../lib/validate.js';
import * as Admin from './admin.model.js';

// One line in the admin's history for this action (shown on the user's admin page).
export const logAdmin = (action, userId, detail = null) => Admin.logAction(action, userId, detail).catch((err) => console.error(err));

// The account being fixed, or an answer saying why it can't be.
export async function adminTarget(req, res) {
  const u = await Admin.findTarget(num(req.params.id));
  if (!u) { res.status(404).json({ error: 'User not found' }); return null; }
  if (u.deleted_at) { res.status(409).json({ error: 'This account was deleted.' }); return null; }
  return u;
}
