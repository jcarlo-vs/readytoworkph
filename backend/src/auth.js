import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import jwt from 'jsonwebtoken';

const scryptAsync = promisify(scrypt);

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scryptAsync(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [salt, hex] = stored.split(':');
  const key = await scryptAsync(password, salt, 64);
  return timingSafeEqual(key, Buffer.from(hex, 'hex'));
}

const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
const signAdminToken = () => jwt.sign({ admin: true }, process.env.JWT_SECRET, { expiresIn: '12h' });
const verify = (token) => jwt.verify(token ?? '', process.env.JWT_SECRET, { algorithms: ['HS256'] });

// Logins live in cookies the page's own scripts can't read (HttpOnly), that only travel over HTTPS
// (Secure, on the live site), that other websites never send along (SameSite=Strict), and only to the
// API. So a login can't be copied out of the browser by injected code or used from another site.
const SESSION = 'rw_session';
const ADMIN = 'rw_admin';
const readCookie = (req, name) =>
  (req.get('cookie') ?? '').split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
const options = (req, path, maxAge) => ({ httpOnly: true, secure: req.secure, sameSite: 'strict', path, maxAge });
const DAY = 24 * 3600 * 1000;

export const startSession = (req, res, user) => res.cookie(SESSION, signToken(user), options(req, '/api', 7 * DAY));
export const endSession = (req, res) => res.clearCookie(SESSION, options(req, '/api'));
export const startAdminSession = (req, res) => res.cookie(ADMIN, signAdminToken(), options(req, '/api/admin', DAY / 2));
export const endAdminSession = (req, res) => res.clearCookie(ADMIN, options(req, '/api/admin'));

export function requireAuth(role) {
  return (req, res, next) => {
    try {
      req.user = verify(readCookie(req, SESSION));
    } catch {
      return res.status(401).json({ error: 'Not logged in' });
    }
    if (req.user.admin) return res.status(401).json({ error: 'Not logged in' }); // admin logins aren't user accounts
    if (role && req.user.role !== role) return res.status(403).json({ error: `Only ${role}s can do this` });
    next();
  };
}

// The signed-in user, or null for visitors (for public pages that show more to members).
export function signedInUser(req) {
  try {
    const user = verify(readCookie(req, SESSION));
    return user.admin ? null : user;
  } catch {
    return null;
  }
}

// The admin panel uses its own login (ADMIN_EMAIL / ADMIN_PASSWORD), separate from user accounts.
export function requireAdmin(req, res, next) {
  try {
    if (verify(readCookie(req, ADMIN)).admin) return next();
  } catch { /* fall through */ }
  res.status(401).json({ error: 'Admin login required' });
}

// For tests: a signed admin token, sent as the rw_admin cookie.
export { signAdminToken };
