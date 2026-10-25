import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import jwt from 'jsonwebtoken';
import { pool } from './db.js';

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

// The signed-in user ({ id, role }), or null for visitors. A login stops working when it expires, when the
// account is gone, or when the account signed everyone out after it was issued (password reset, Google
// taking over an account), so a stolen login dies with the password.
export async function signedInUser(req) {
  let token;
  try {
    token = verify(readCookie(req, SESSION));
  } catch {
    return null;
  }
  if (token.admin) return null; // admin logins aren't user accounts
  const { rows: [u] } = await pool.query(
    'SELECT role, email_verified_at IS NOT NULL AS verified, floor(extract(epoch FROM sessions_valid_from))::bigint AS since FROM users WHERE id = $1', [token.id]);
  if (!u || token.iat < Number(u.since) || u.role === 'team') return null; // nobody signs in as the Team account
  return { id: token.id, role: u.role, verified: u.verified };
}

// Email sign-ups enter a 6-digit code before they can do anything; only the routes the code screen needs
// (who am I, check/resend the code, fix a mistyped email, delete or pause the account) pass `{ unconfirmed: true }`.
export function requireAuth(role, { unconfirmed = false } = {}) {
  return async (req, res, next) => {
    req.user = await signedInUser(req);
    if (!req.user) return res.status(401).json({ error: 'Not logged in' });
    if (!req.user.verified && !unconfirmed)
      return res.status(403).json({ error: 'Please confirm your email first. Enter the 6-digit code we sent you.', code: 'verify_email' });
    if (role && req.user.role !== role) return res.status(403).json({ error: `Only ${role}s can do this` });
    next();
  };
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
