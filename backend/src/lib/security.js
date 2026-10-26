// Constant-time comparison and one-way hashing for tokens and codes.
import { createHash, timingSafeEqual } from 'node:crypto';

export const sameText = (a, b) => timingSafeEqual(createHash('sha256').update(String(a)).digest(), createHash('sha256').update(String(b)).digest());
export const hashToken = (t) => createHash('sha256').update(t).digest('hex');
