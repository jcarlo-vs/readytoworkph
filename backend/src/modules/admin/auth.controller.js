// The admin panel's own login, separate from user accounts.
import { visitor } from '../../lib/request.js';
import { sameText } from '../../lib/security.js';
import { str } from '../../lib/validate.js';
import { endAdminSession, startAdminSession } from '../../middleware/auth.js';
import { notHuman, verifyHuman } from '../../middleware/human.js';
import { limiter, tooMany } from '../../middleware/rateLimit.js';

const adminFails = limiter(5, 15 * 60_000, true); // always strict, even in tests

export const login = async (req, res) => {
  if (!(await verifyHuman(req))) return notHuman(res); // every attempt: the admin can do the most damage
  if (adminFails.blocked(visitor(req))) return tooMany(res, '15 minutes');
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return res.status(503).json({ error: 'Admin login is not set up' });
  const ok = sameText(str(req.body.email).toLowerCase(), ADMIN_EMAIL.toLowerCase()) & sameText(req.body.password ?? '', ADMIN_PASSWORD);
  if (!ok) {
    adminFails.hit(visitor(req));
    return res.status(401).json({ error: 'Wrong email or password' });
  }
  adminFails.clear(visitor(req));
  startAdminSession(req, res);
  res.json({ ok: true });
};

export const logout = (req, res) => {
  endAdminSession(req, res);
  res.status(204).end();
};
