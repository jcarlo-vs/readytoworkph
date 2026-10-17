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

export const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

export function requireAuth(role) {
  return (req, res, next) => {
    const token = req.get('authorization')?.replace(/^Bearer /, '');
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Not logged in' });
    }
    if (req.user.admin) return res.status(401).json({ error: 'Not logged in' }); // admin tokens aren't user accounts
    if (role && req.user.role !== role) return res.status(403).json({ error: `Only ${role}s can do this` });
    next();
  };
}

// The admin panel uses its own login (ADMIN_EMAIL / ADMIN_PASSWORD in .env), separate from user accounts.
export const signAdminToken = () => jwt.sign({ admin: true }, process.env.JWT_SECRET, { expiresIn: '12h' });

export function requireAdmin(req, res, next) {
  try {
    if (jwt.verify(req.get('authorization')?.replace(/^Bearer /, ''), process.env.JWT_SECRET).admin) return next();
  } catch { /* fall through */ }
  res.status(401).json({ error: 'Admin login required' });
}
