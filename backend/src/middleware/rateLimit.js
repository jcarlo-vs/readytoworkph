// Rate limits: per visitor or per signed-in user.
import { visitor } from '../lib/request.js';
import { hooks } from '../services/hooks.js';

// ponytail: in-memory counters per key (fixed windows), reset on restart and kept per server copy;
// Cloudflare's rate limit is the outer wall. Move to a shared store (e.g. Redis) if abuse gets past both.
export function limiter(max, windowMs, strict = false) {
  const hits = new Map(); // key -> { n, until }
  const on = () => strict || !hooks.relaxedLimits;
  const current = (key) => { const e = hits.get(key); return e && e.until > Date.now() ? e : null; };
  // Forget expired visitors, so a flood of different addresses can't fill the server's memory.
  setInterval(() => { for (const [k, e] of hits) if (e.until <= Date.now()) hits.delete(k); }, windowMs).unref();
  return {
    blocked: (key) => on() && (current(key)?.n ?? 0) >= max,
    hit: (key) => { if (!on()) return; const e = current(key); if (e) e.n++; else hits.set(key, { n: 1, until: Date.now() + windowMs }); },
    clear: (key) => hits.delete(key),
    left: (key) => max - (current(key)?.n ?? 0),
  };
}

export const tooMany = (res, wait) => res.status(429).json({ error: `Too many attempts. Please try again in ${wait}.` });

// Route guard: counts every request; `key` picks who is counted (the visitor's address, or the signed-in user).
export const throttle = (max, windowMs, wait, key = visitor) => {
  const l = limiter(max, windowMs);
  return (req, res, next) => {
    const k = key(req);
    if (l.blocked(k)) return tooMany(res, wait);
    l.hit(k);
    next();
  };
};

export const perUser = (req) => `u${req.user.id}`;
