import express from 'express';
import cors from 'cors';
import { OAuth2Client } from 'google-auth-library';
import { pool, q } from './db.js';
import { hashPassword, verifyPassword, requireAuth, signedInUser, requireAdmin, startSession, endSession, startAdminSession, endAdminSession } from './auth.js';
import { sendEmail, renderEmail } from './email.js';
import { analyzeApplication } from './analyzer.js';
import { callClaude, runMatchAgent } from './matchAgent.js';
import { extractText, getDocumentProxy } from 'unpdf';
import { storage } from './storage.js';
import { randomUUID, randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto';

const TYPES = ['full-time', 'part-time', 'gig'];
const PAGE_SIZE = 20;
const PERIODS = ['hour', 'month', 'year', 'fixed'];
// What each employer plan includes (null = unlimited); the pricing page promises exactly this.
// Free's AI analyses are set by the admin. Job posts and analyses count per calendar month in
// Philippine time, so they reset on the 1st.
const PLAN_LIMITS = {
  free: { name: 'Free', posts: 3, applicants: 20, outreach: false, matches: 0 },
  pro: { name: 'Pro', posts: 5, applicants: 100, analyses: 500, outreach: true, matches: 3 },
  premium: { name: 'Premium', posts: 10, applicants: null, analyses: null, outreach: true, matches: 30 },
};
// Premium's AI analyses are unlimited for any real hiring; this fair-use ceiling only stops a runaway
// script (each analysis costs about $0.001-0.002, so the ceiling bounds one account at ~$10-20 a month).
export const PREMIUM_FAIR_USE = 10_000;
const MONTH_PH = `(date_trunc('month', now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila')`;
const planOf = async (db, userId) => (await db.query('SELECT plan FROM users WHERE id = $1', [userId])).rows[0]?.plan ?? 'free';
// An application's place in line for its job (0 = first to apply). Employers see applicants first come,
// first served up to their plan's limit (Free: the first 20); later ones stay hidden until they upgrade.
// Credits don't change who is visible, only the order the visible ones are listed in.
const RANK = `(SELECT count(*) FROM applications b WHERE b.job_id = a.job_id
  AND (b.created_at, b.id) < (a.created_at, a.id))::int`;
const hiddenApplicant = (res, plan) => res.status(402).json({
  error: `This applicant is beyond the ${PLAN_LIMITS[plan].applicants} you can see on the ${PLAN_LIMITS[plan].name} plan. Upgrade to see them.`, upgrade: true,
});
export const DAILY_CREDITS = 60;

// Site settings the admin can change at /admin, stored in the settings table (defaults apply until changed).
const SETTINGS = {
  topups_enabled: { default: false, valid: (v) => typeof v === 'boolean' },
  daily_applications: { default: 60, valid: (v) => Number.isInteger(v) && v >= 1 && v <= 500 }, // spam cap; 0-credit applies are free
  free_ai_analyses: { default: 5, valid: (v) => Number.isInteger(v) && v >= 0 && v <= 1000 },
  free_full_names: { default: false, valid: (v) => typeof v === 'boolean' }, // Free employers see "Maria Santos", not "Maria S."
  max_job_applications: { default: 250, valid: (v) => Number.isInteger(v) && v >= 10 && v <= 5000 }, // a job closes itself when full
};
async function getSettings() {
  const { rows } = await q('SELECT key, value FROM settings');
  const saved = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(Object.entries(SETTINGS).map(([k, s]) => [k, k in saved ? saved[k] : s.default]));
}
// Credits refill at midnight Philippine time.
const TODAY_PH = `(date_trunc('day', now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila')`;

async function creditsToday(db, workerId) {
  const { rows } = await db.query(
    `SELECT coalesce(sum(credits), 0)::int AS used, count(*)::int AS applications, ${TODAY_PH} + interval '1 day' AS resets_at
     FROM applications WHERE worker_id = $1 AND created_at >= ${TODAY_PH}`,
    [workerId]
  );
  const { used, applications, resets_at } = rows[0];
  return { daily: DAILY_CREDITS, used, remaining: DAILY_CREDITS - used, applications, resets_at };
}

const str = (v, max = 5000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
const skillList = (v) =>
  [...new Set((Array.isArray(v) ? v : String(v ?? '').split(','))
    .map((s) => String(s).trim().toLowerCase().slice(0, 50)).filter(Boolean))].slice(0, 30);
const bad = (res, error) => res.status(400).json({ error });
// Compares secrets in constant time, so response timing reveals nothing about them.
// Robot check (Cloudflare Turnstile) for the forms bots abuse: sign-up, forgot password, contact, visitor
// feedback. The page sends the widget's token; Cloudflare says whether a person earned it. Without
// TURNSTILE_SECRET (local development, tests) the check is skipped. Swappable for tests.
async function verifyHuman(req) {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return true;
  const token = typeof req.body?.turnstile === 'string' ? req.body.turnstile : '';
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token, remoteip: req.visitor ?? req.ip }),
    });
    return (await res.json()).success === true;
  } catch (err) {
    console.error('Turnstile check failed', err); // Cloudflare unreachable: let people through rather than lock everyone out
    return true;
  }
}
const notHuman = (res) => res.status(400).json({ error: 'Please complete the “I’m human” check and try again.', code: 'robot_check' });

const sameText = (a, b) => timingSafeEqual(createHash('sha256').update(String(a)).digest(), createHash('sha256').update(String(b)).digest());

export const app = express();
app.set('trust proxy', 1); // behind Cloud Run's load balancer: req.ip is the real visitor
app.disable('x-powered-by');
app.locals.sendEmail = sendEmail; // swappable so tests can capture emails

// In production the API is only reachable through Cloudflare: the site's Worker forwards /api requests
// with this secret header, so calls straight to the Cloud Run address are refused. Cloudflare also
// tells us the visitor's real address (otherwise every visitor would look like the Worker).
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  const secret = process.env.ORIGIN_SECRET;
  if (!secret) return next(); // local development
  if (!sameText(req.get('x-origin-secret') ?? '', secret)) return res.status(403).json({ error: 'Forbidden' });
  req.visitor = req.get('x-visitor-ip') || req.ip;
  next();
});
const visitor = (req) => req.visitor ?? req.ip;
// FRONTEND_ORIGIN can list several sites, comma-separated (e.g. the live domain and a test address).
// Browsers may call the API from any of them; links in emails use the first one.
const SITES = (process.env.FRONTEND_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const SITE = SITES[0];
app.use(cors({ origin: SITES }));
// Paddle signs the exact bytes it sends, so the webhook keeps the raw body for checking.
app.use(express.json({ limit: '100kb', verify: (req, res, buf) => { if (req.url === '/api/billing/webhook') req.rawBody = buf; } }));

// Welcome email for every new account (email or Google sign-up); sending happens in the background.
function welcome({ email, name, role }) {
  const site = SITE;
  const worker = role === 'worker';
  const email_ = renderEmail(worker ? {
    preheader: 'Your worker account is ready. Here’s how to land your first remote job.',
    greeting: `Hi ${name},`,
    intro: ['Welcome to ReadyToWork.ph! Your worker account is ready. Here’s how to get hired:'],
    steps: [
      ['Complete your profile', 'Add a professional title, your skills and your rate so employers can find you. A resume helps too.'],
      ['Browse remote jobs', 'Full-time, part-time and gig work from employers around the world.'],
      ['Apply with Credits', 'You get 60 free Credits every day. They’re optional: put more on the jobs you want most and employers see you first.'],
    ],
    button: { label: 'Complete your profile', url: `${site}/profile` },
    reason: 'You’re receiving this because you created a worker account on ReadyToWork.ph.',
  } : {
    preheader: 'Your employer account is ready. Here’s how to make your first hire.',
    greeting: `Hi ${name},`,
    intro: ['Welcome to ReadyToWork.ph! Your employer account is ready. Here’s how to find your next great hire:'],
    steps: [
      ['Post your first job', 'Describe the role, the skills you need and your budget. Posting is free.'],
      ['Review applicants', 'Applicants are sorted by interest, and the Smart Score shows how well each one fits.'],
      ['Message and hire directly', 'Talk to candidates, agree on pay together, and pay them directly. No markups.'],
    ],
    button: { label: 'Post your first job', url: `${site}/jobs/new` },
    reason: 'You’re receiving this because you created an employer account on ReadyToWork.ph.',
  });
  app.locals.sendEmail({
    to: email,
    subject: worker ? 'Welcome to ReadyToWork.ph: let’s get you hired' : 'Welcome to ReadyToWork.ph: start hiring Filipino talent',
    ...email_,
  }).catch((err) => console.error(err));
}

// ponytail: in-memory counters per key (fixed windows), reset on restart and kept per server copy;
// Cloudflare's rate limit is the outer wall. Move to a shared store (e.g. Redis) if abuse gets past both.
function limiter(max, windowMs, strict = false) {
  const hits = new Map(); // key -> { n, until }
  const on = () => strict || !app.locals.relaxedLimits;
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
const tooMany = (res, wait) => res.status(429).json({ error: `Too many attempts. Please try again in ${wait}.` });
// Route guard: counts every request; `key` picks who is counted (the visitor's address, or the signed-in user).
const throttle = (max, windowMs, wait, key = visitor) => {
  const l = limiter(max, windowMs);
  return (req, res, next) => {
    const k = key(req);
    if (l.blocked(k)) return tooMany(res, wait);
    l.hit(k);
    next();
  };
};
const perUser = (req) => `u${req.user.id}`;

app.use('/api', throttle(300, 60_000, 'a minute')); // any request, per visitor
// Remembers when each signed-in user was last active and their country (Cloudflare's guess from the
// IP; the IP itself isn't stored), for the admin dashboard. At most one write per user per minute.
const lastSeen = new Map();
app.use('/api', (req, res, next) => {
  res.on('finish', () => {
    const id = req.user?.id;
    if (!id || Date.now() - (lastSeen.get(id) ?? 0) < 60_000) return;
    lastSeen.set(id, Date.now());
    const country = req.get('cf-ipcountry');
    q('UPDATE users SET last_seen_at = now(), last_country = coalesce($2, last_country) WHERE id = $1',
      [id, /^[A-Z]{2}$/.test(country ?? '') ? country : null]).catch((err) => console.error(err));
  });
  next();
});

const loginFails = limiter(10, 15 * 60_000); // wrong passwords per visitor
const signups = limiter(10, 60 * 60_000); // new accounts per visitor

// --- Auth ---
// Suspended accounts can't log in, and their email can't sign up again (kept only as a one-way hash).
const SUSPENDED = { error: 'This account has been suspended. If you think this is a mistake, contact support@readytowork.ph.', code: 'suspended' };
const BLOCKED = { error: 'This email can’t be used to create an account. If you think this is a mistake, contact support@readytowork.ph.', code: 'blocked' };
const isSuspended = async (id) => (await q('SELECT 1 FROM users WHERE id = $1 AND suspended_at IS NOT NULL', [id])).rowCount > 0;
const isBlocked = async (email) => (await q('SELECT 1 FROM blocked_emails WHERE email_hash = $1', [hashToken(email)])).rowCount > 0;

app.post('/api/auth/register', async (req, res) => {
  if (signups.blocked(visitor(req))) return tooMany(res, 'an hour');
  if (!(await verifyHuman(req))) return notHuman(res);
  const email = str(req.body.email, 200).toLowerCase();
  const { name, first, last } = nameOf(req.body);
  const { password, role } = req.body;
  if (!/^\S+@\S+\.\S+$/.test(email)) return bad(res, 'Valid email required');
  if (!name) return bad(res, 'Name required');
  if (typeof password !== 'string' || password.length < 8) return bad(res, 'Password must be at least 8 characters');
  if (!['worker', 'employer'].includes(role)) return bad(res, 'Role must be worker or employer');
  if (await isBlocked(email)) return res.status(403).json(BLOCKED);

  const { rows } = await q(
    `INSERT INTO users (email, password_hash, name, role, first_name, last_name) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (email) DO NOTHING RETURNING id, email, name, role, plan, photo_key IS NOT NULL AS has_photo, email_verified_at IS NOT NULL AS email_verified`,
    [email, await hashPassword(password), name, role, first, last]
  );
  if (!rows[0]) return res.status(409).json({ error: 'This email already has an account. Log in, or use a different email to create another account.' });
  signups.hit(visitor(req));
  if (role === 'worker') await q('INSERT INTO worker_profiles (user_id) VALUES ($1)', [rows[0].id]);
  welcome(rows[0]);
  await sendVerification(rows[0]); // the link is saved before the account is handed back
  startSession(req, res, rows[0]);
  res.status(201).json({ user: rows[0] });
});

// Password guessing is stopped three ways:
//  - per visitor: 10 wrong tries in 15 minutes pauses that visitor (loginFails);
//  - per account: 5 wrong passwords in 15 minutes pauses password login for that account for 15 minutes,
//    from anywhere, and emails the owner. It's in the database, so restarts and server copies don't reset it.
//    Resetting the password lifts the pause, and Google sign-in still works, so nobody can lock a real
//    person out of their own account for long;
//  - after 2 wrong tries (by the visitor or on the account) the robot check is required too.
export const ACCOUNT_TRIES = 5;
const LOCK_MINUTES = 15;
app.post('/api/auth/login', async (req, res) => {
  if (loginFails.blocked(visitor(req))) return tooMany(res, '15 minutes');
  const { rows } = await q(
    `SELECT *, CASE WHEN failed_login_at > now() - interval '${LOCK_MINUTES} minutes' THEN failed_logins ELSE 0 END AS recent_fails
     FROM users WHERE email = $1`, [str(req.body.email, 200).toLowerCase()]);
  const user = rows[0];
  if (user?.login_locked_until > new Date()) {
    const minutes = Math.ceil((user.login_locked_until - Date.now()) / 60_000);
    return res.status(429).json({ error: `Too many wrong passwords. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or reset your password.`, code: 'locked', minutes });
  }
  const triedBefore = 10 - loginFails.left(visitor(req)) >= 2 || (user?.recent_fails ?? 0) >= 2;
  if (triedBefore && !(await verifyHuman(req))) return notHuman(res);
  // Say exactly what's wrong, with a way forward. (Sign-up already tells people when an email is taken,
  // so naming "no account" here reveals nothing new; the attempt limits still stop password guessing.)
  const fail = (code, error, extra = {}) => {
    loginFails.hit(visitor(req));
    const left = Math.min(loginFails.left(visitor(req)), extra.accountLeft ?? Infinity);
    res.status(401).json({ error, code, attemptsLeft: left, robotCheck: triedBefore || 10 - loginFails.left(visitor(req)) >= 2 || extra.accountTries >= 2 });
  };
  if (!user) return fail('no_account', 'No account uses this email.');
  if (!user.password_hash) return fail('google_account', 'This account signs in with Google. Use the Google button above.');
  if (!(await verifyPassword(String(req.body.password ?? ''), user.password_hash))) {
    const tries = user.recent_fails + 1;
    if (tries >= ACCOUNT_TRIES) {
      await q(`UPDATE users SET failed_logins = 0, failed_login_at = NULL, login_locked_until = now() + interval '${LOCK_MINUTES} minutes' WHERE id = $1`, [user.id]);
      loginFails.hit(visitor(req));
      app.locals.sendEmail({
        to: user.email,
        subject: 'Someone tried to log in to your ReadyToWork.ph account',
        ...renderEmail({
          preheader: `${ACCOUNT_TRIES} wrong passwords in a row, so we paused password login for ${LOCK_MINUTES} minutes.`,
          greeting: `Hi ${user.name},`,
          intro: [
            `Someone entered the wrong password for your account ${ACCOUNT_TRIES} times in a row, so we paused logging in with a password for ${LOCK_MINUTES} minutes to keep your account safe.`,
            'If it was you, you can wait or reset your password now (that also ends the pause). If it wasn’t you, your account is safe, and choosing a new password is a good idea.',
          ],
          button: { label: 'Reset my password', url: `${SITE}/forgot-password?email=${encodeURIComponent(user.email)}` },
          reason: 'You’re receiving this because of failed login attempts on your ReadyToWork.ph account.',
        }),
      }).catch((err) => console.error(err));
      return res.status(429).json({ error: `Too many wrong passwords. Try again in ${LOCK_MINUTES} minutes, or reset your password.`, code: 'locked', minutes: LOCK_MINUTES });
    }
    await q('UPDATE users SET failed_logins = $2, failed_login_at = now() WHERE id = $1', [user.id, tries]);
    return fail('wrong_password', 'Incorrect password.', { accountLeft: ACCOUNT_TRIES - tries, accountTries: tries });
  }
  loginFails.clear(visitor(req));
  if (user.suspended_at) return res.status(403).json(SUSPENDED);
  if (user.recent_fails || user.login_locked_until) await q('UPDATE users SET failed_logins = 0, failed_login_at = NULL, login_locked_until = NULL WHERE id = $1', [user.id]);
  const { id, email, name, role, plan } = user;
  const reactivated = await reactivate(id);
  startSession(req, res, user);
  res.json({ user: { id, email, name, role, plan, has_photo: !!user.photo_key, email_verified: !!user.email_verified_at }, reactivated });
});

app.post('/api/auth/logout', (req, res) => {
  endSession(req, res);
  res.status(204).end();
});

// --- Forgot password ---
const resetRequests = limiter(5, 60 * 60_000); // reset emails per visitor per hour
const hashToken = (t) => createHash('sha256').update(t).digest('hex');

// Always answers the same way, so this can't be used to check which emails have accounts.
app.post('/api/auth/forgot', async (req, res) => {
  if (resetRequests.blocked(visitor(req))) return tooMany(res, 'an hour');
  if (!(await verifyHuman(req))) return notHuman(res);
  resetRequests.hit(visitor(req));
  const email = str(req.body.email, 200).toLowerCase();
  const { rows: [user] } = await q('SELECT id, name, email FROM users WHERE email = $1', [email]);
  if (user) {
    const token = randomBytes(32).toString('base64url');
    await q(`INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '1 hour')`, [hashToken(token), user.id]);
    app.locals.sendEmail({
      to: user.email,
      subject: 'Reset your ReadyToWork.ph password',
      ...renderEmail({
        preheader: 'Choose a new password. This link works for 1 hour.',
        greeting: `Hi ${user.name},`,
        intro: ['We got a request to reset the password for your ReadyToWork.ph account. Choose a new one with the button below. The link works once and expires in 1 hour.'],
        button: { label: 'Choose a new password', url: `${SITE}/reset-password?token=${token}` },
        reason: 'You’re receiving this because someone asked to reset your password. If it wasn’t you, ignore this email: your password stays the same.',
      }),
    }).catch((err) => console.error(err));
  }
  res.json({ ok: true });
});

// --- Email confirmation ---
// A one-time link, good for 3 days. Asking again replaces the old link.
async function sendVerification(user) {
  const token = randomBytes(32).toString('base64url');
  await q('DELETE FROM email_verifications WHERE user_id = $1', [user.id]);
  await q(`INSERT INTO email_verifications (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '3 days')`, [hashToken(token), user.id]);
  app.locals.sendEmail({
    to: user.email,
    subject: 'Confirm your email for ReadyToWork.ph',
    ...renderEmail({
      preheader: 'One click to confirm this is your email address.',
      greeting: `Hi ${user.name},`,
      intro: ['Please confirm this is your email address. It keeps your account safe and makes sure messages from employers and workers reach you. The link works for 3 days.'],
      button: { label: 'Confirm my email', url: `${SITE}/verify-email?token=${token}` },
      reason: 'You’re receiving this because this email was used to create a ReadyToWork.ph account. If that wasn’t you, ignore this email.',
    }),
  }).catch((err) => console.error(err));
}

// Opened from the email link; works whether or not the person is logged in on this device.
app.post('/api/auth/verify', async (req, res) => {
  const { rows: [v] } = await q(
    'DELETE FROM email_verifications WHERE token_hash = $1 AND expires_at > now() RETURNING user_id', [hashToken(String(req.body.token ?? ''))]);
  if (!v) return res.status(400).json({ error: 'This link has expired or was already used. Log in and ask for a new one.', code: 'invalid_link' });
  await q('UPDATE users SET email_verified_at = coalesce(email_verified_at, now()) WHERE id = $1', [v.user_id]);
  res.json({ ok: true });
});

app.post('/api/auth/verify/resend', requireAuth(), throttle(3, 60 * 60_000, 'an hour', perUser), async (req, res) => {
  const { rows: [user] } = await q('SELECT id, name, email, email_verified_at FROM users WHERE id = $1', [req.user.id]);
  if (!user.email_verified_at) await sendVerification(user);
  res.json({ ok: true, verified: !!user.email_verified_at });
});

// Sets the new password from a reset link and signs the person in.
app.post('/api/auth/reset', async (req, res) => {
  const { password } = req.body;
  if (typeof password !== 'string' || password.length < 8) return bad(res, 'Password must be at least 8 characters');
  const { rows: [reset] } = await q(
    `UPDATE password_resets SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id`,
    [hashToken(String(req.body.token ?? ''))]
  );
  if (!reset) return res.status(400).json({ error: 'This reset link has expired or was already used. Request a new one.', code: 'invalid_link' });
  const { rows: [user] } = await q(
    // a new password also ends any login pause on the account
    // ...and signs out every other device: if someone else was in, they're out now
    `UPDATE users SET password_hash = $2, failed_logins = 0, failed_login_at = NULL, login_locked_until = NULL,
       sessions_valid_from = date_trunc('second', now()), email_verified_at = coalesce(email_verified_at, now())
     WHERE id = $1 RETURNING id, email, name, role, plan, photo_key IS NOT NULL AS has_photo, email_verified_at IS NOT NULL AS email_verified`,
    [reset.user_id, await hashPassword(password)]
  );
  await q('DELETE FROM password_resets WHERE user_id = $1', [user.id]); // older links stop working too
  loginFails.clear(visitor(req));
  startSession(req, res, user);
  res.json({ user });
});

// Swappable so tests can fake Google; real tokens are checked against GOOGLE_CLIENT_ID.
const googleClient = new OAuth2Client();
app.locals.verifyGoogle = async (idToken) =>
  (await googleClient.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID })).getPayload();

app.post('/api/auth/google', throttle(30, 15 * 60_000, '15 minutes'), async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'Google sign-in is not configured' });
  let g;
  try {
    g = await app.locals.verifyGoogle(String(req.body.credential ?? ''));
  } catch {
    return res.status(401).json({ error: 'Google sign-in failed' });
  }
  if (!g?.email_verified) return res.status(401).json({ error: 'Google account email is not verified' });
  const email = g.email.toLowerCase();

  // Existing account: match on Google ID, else link by verified email.
  let { rows } = await q('SELECT id, email, name, role, plan, photo_key IS NOT NULL AS has_photo, email_verified_at IS NOT NULL AS email_verified FROM users WHERE google_sub = $1', [g.sub]);
  // An unconfirmed email sign-up could be anyone's (an address and a password they know). Google proves who
  // owns the address: linking to an unconfirmed account removes that password and signs out every other
  // login (the owner can set a new password with "Forgot password"). Confirmed accounts keep theirs.
  if (!rows[0]) {
    ({ rows } = await q(
      `WITH old AS (SELECT id, password_hash IS NOT NULL AND email_verified_at IS NULL AS had_password FROM users WHERE email = $2 AND google_sub IS NULL)
       UPDATE users u SET google_sub = $1, email_verified_at = coalesce(u.email_verified_at, now()),
         password_hash = CASE WHEN old.had_password THEN NULL ELSE u.password_hash END,
         sessions_valid_from = CASE WHEN old.had_password THEN date_trunc('second', now()) ELSE u.sessions_valid_from END
       FROM old WHERE u.id = old.id
       RETURNING u.id, u.email, u.name, u.role, u.plan, u.photo_key IS NOT NULL AS has_photo, true AS email_verified, old.had_password`,
      [g.sub, email]
    ));
    if (rows[0]?.had_password) {
      app.locals.sendEmail({
        to: rows[0].email,
        subject: 'Your ReadyToWork.ph account now signs in with Google',
        ...renderEmail({
          preheader: 'We linked your Google account and removed the old password.',
          greeting: `Hi ${rows[0].name},`,
          intro: ['You just signed in with Google, so your account now uses Google to log in. To keep it safe, we removed the password it had and signed out other devices.',
            'Want a password too? Use “Forgot password” on the log-in page to set one.'],
          button: { label: 'Log in', url: `${SITE}/login` },
          reason: 'You’re receiving this because the way you log in changed. If this wasn’t you, reply to this email right away.',
        }),
      }).catch((err) => console.error(err));
    }
    if (rows[0]) delete rows[0].had_password;
  }
  const { role } = req.body;
  // One account per email, with one role. Signing up as the other role doesn't silently log into this account.
  if (rows[0] && role && role !== rows[0].role)
    return res.status(409).json({ error: `This Google account already has a ${rows[0].role === 'worker' ? 'job seeker' : 'employer'} account. To ${role === 'employer' ? 'hire' : 'look for work'}, sign up with a different email.`, existingRole: rows[0].role });
  if (rows[0]) {
    if (await isSuspended(rows[0].id)) return res.status(403).json(SUSPENDED);
    const reactivated = await reactivate(rows[0].id);
    startSession(req, res, rows[0]);
    return res.json({ user: rows[0], reactivated });
  }

  if (!['worker', 'employer'].includes(role))
    return res.status(404).json({ error: 'No account yet. Choose how you’ll use ReadyToWork.ph to sign up.', needsRole: true });
  if (await isBlocked(email)) return res.status(403).json(BLOCKED);
  ({ rows } = await q(
    `INSERT INTO users (email, name, role, google_sub, email_verified_at, first_name, last_name) VALUES ($1, $2, $3, $4, now(), $5, $6) RETURNING id, email, name, role, plan, photo_key IS NOT NULL AS has_photo, email_verified_at IS NOT NULL AS email_verified`,
    [email, str(g.name, 100) || email.split('@')[0], role, g.sub, str(g.given_name, 50) ?? '', str(g.family_name, 50) ?? ''] // Google sends both names
  ));
  if (role === 'worker') await q('INSERT INTO worker_profiles (user_id) VALUES ($1)', [rows[0].id]);
  welcome(rows[0]);
  startSession(req, res, rows[0]);
  res.status(201).json({ user: rows[0] });
});

// Delete my account, straight away (type DELETE to confirm). A paid plan is cancelled at Paddle first, so a
// failure there stops everything and nothing is half-deleted. Files go, then the data in one transaction;
// the user row becomes a blank placeholder so the other side of a conversation still reads "Deleted user".
app.delete('/api/me', requireAuth(), throttle(5, 60 * 60_000, 'an hour', perUser), async (req, res) => {
  if (req.body?.confirm !== 'DELETE') return bad(res, 'Type DELETE to confirm');
  const id = req.user.id;
  const { rows: [u] } = await q(
    'SELECT u.photo_key, u.paddle_subscription_id, p.resume_key FROM users u LEFT JOIN worker_profiles p ON p.user_id = u.id WHERE u.id = $1', [id]);
  if (u.paddle_subscription_id && process.env.PADDLE_API_KEY) {
    try {
      await paddle(`/subscriptions/${u.paddle_subscription_id}/cancel`, { effective_from: 'immediately' });
    } catch (err) {
      if (err.paddle?.code !== 'subscription_locked_pending_changes' && !/canceled|cancelled/i.test(err.message)) {
        console.error(err);
        return res.status(502).json({ error: 'We couldn’t cancel your subscription just now, so nothing was deleted. Please try again in a minute, or contact support.' });
      }
    }
  }
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    for (const sql of [
      'DELETE FROM jobs WHERE employer_id = $1', // and, with them, their applications
      // A worker's applications stay as anonymous rows ("An applicant deleted their account"), so employers'
      // counts and rankings still add up; what they wrote, their resume and the AI analysis are removed.
      'UPDATE applications SET cover_letter = \'\', analysis = NULL, analyzed_at = NULL, resume_attached = false WHERE worker_id = $1',
      'DELETE FROM worker_profiles WHERE user_id = $1',
      'DELETE FROM saved_workers WHERE employer_id = $1 OR worker_id = $1',
      'DELETE FROM hires WHERE employer_id = $1', // an employer's own list goes; a worker stays in theirs as "Deleted user"
      'DELETE FROM password_resets WHERE user_id = $1',
      'DELETE FROM email_verifications WHERE user_id = $1',
      `UPDATE users SET name = 'Deleted user', first_name = '', last_name = '', email = 'deleted-' || id || '@deleted.invalid', password_hash = NULL, google_sub = NULL,
         photo_key = NULL, plan = 'free', paddle_customer_id = NULL, paddle_subscription_id = NULL, last_country = NULL,
         email_verified_at = NULL, deleted_at = now(), sessions_valid_from = now() + interval '1 second' WHERE id = $1`,
    ]) await db.query(sql, [id]);
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
  [u.photo_key, u.resume_key].forEach(deleteFile);
  endSession(req, res);
  res.status(204).end();
});

// Pause my account: hidden from search and new messages, jobs hidden; everything is kept. It signs out every
// device; logging in again (password or Google) reactivates it.
app.post('/api/me/deactivate', requireAuth(), async (req, res) => {
  await q(`UPDATE users SET deactivated_at = now(), sessions_valid_from = now() + interval '1 second' WHERE id = $1`, [req.user.id]);
  endSession(req, res);
  res.status(204).end();
});
// Called on every successful login: true when it just woke a paused account.
const reactivate = async (id) => (await q('UPDATE users SET deactivated_at = NULL WHERE id = $1 AND deactivated_at IS NOT NULL', [id])).rowCount > 0;

// People give a first and last name; an employer may instead give a company name (`name`). A single
// name (older pages) is split at the first space.
function nameOf(body) {
  const name = str(body?.first_name, 50) && str(body?.last_name, 50)
    ? `${str(body.first_name, 50)} ${str(body.last_name, 50)}` : str(body?.name, 100);
  const first = str(body?.first_name, 50) || name.split(' ')[0];
  const last = str(body?.first_name, 50) ? str(body?.last_name, 50) : name.split(' ').slice(1).join(' ');
  return { name, first, last };
}

// Change your name (a worker's first and last name, or an employer's company or own name).
app.put('/api/me', requireAuth(), async (req, res) => {
  const { name, first, last } = nameOf(req.body);
  if (!name) return bad(res, 'Name required');
  const { rows: [u] } = await q(
    `UPDATE users SET name = $2, first_name = $3, last_name = $4 WHERE id = $1
     RETURNING id, email, name, role, plan, photo_key IS NOT NULL AS has_photo, email_verified_at IS NOT NULL AS email_verified`,
    [req.user.id, name, first, last]);
  res.json(u);
});

app.get('/api/me', requireAuth(), async (req, res) => {
  const { rows } = await q(`SELECT id, email, name, role, plan, photo_key IS NOT NULL AS has_photo, email_verified_at IS NOT NULL AS email_verified,
    google_sub IS NOT NULL AS has_google, password_hash IS NOT NULL AS has_password, first_name, last_name FROM users WHERE id = $1`, [req.user.id]);
  rows[0] ? res.json(rows[0]) : res.status(404).json({ error: 'User not found' });
});

app.get('/api/stats', async (req, res) => {
  const { rows } = await q(`SELECT
    (SELECT count(*)::int FROM jobs) AS jobs,
    (SELECT count(*)::int FROM worker_profiles WHERE title <> '') AS workers,
    (SELECT count(*)::int FROM users WHERE role = 'employer' AND deleted_at IS NULL) AS employers,
    (SELECT count(*)::int FROM users WHERE role = 'employer' AND plan <> 'free'
       AND plan_changed_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila') AS upgraded_this_month`);
  res.json(rows[0]);
});

// --- Jobs ---
// Contact details in job posts (emails, links, phone numbers, @handles) are only sent to signed-in members.
// Visitors, scrapers and bots get a placeholder instead, in the HTML and in this API alike, so there's
// nothing to un-blur; the page shows it as "Sign up or log in to see".
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;
export const MEMBERS_ONLY = '[contact hidden, log in to see it]';
const forViewer = async (req, jobs) => ((await signedInUser(req)) ? jobs
  : jobs.map((j) => ({ ...j, title: hideContacts(j.title, MEMBERS_ONLY), description: hideContacts(j.description, MEMBERS_ONLY) })));

app.get('/api/jobs', async (req, res) => {
  const where = ['j.closed_at IS NULL', 'u.deactivated_at IS NULL', 'u.suspended_at IS NULL'];
  const params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replaceAll('?', `$${params.length}`)); };
  if (req.query.q) add('(j.title ILIKE ? OR j.description ILIKE ?)', `%${str(req.query.q, 100)}%`);
  if (req.query.skill) add('? = ANY(j.skills)', str(req.query.skill, 50).toLowerCase());
  if (TYPES.includes(req.query.type)) add('j.job_type = ?', req.query.type);
  const page = Math.min(500, Math.max(1, parseInt(req.query.page) || 1));

  const { rows } = await q(
    `SELECT j.*, u.name AS employer_name FROM jobs j JOIN users u ON u.id = j.employer_id
     WHERE ${where.join(' AND ')}
     ORDER BY j.created_at DESC LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
    params
  );
  res.json(await forViewer(req, rows));
});

// Open jobs for the sitemap Google reads (ids and dates only). Declared before /api/jobs/:id.
app.get('/api/jobs/sitemap', async (req, res) => {
  const { rows } = await q(`SELECT id, coalesce(updated_at, created_at) AS updated_at FROM jobs
    WHERE closed_at IS NULL ORDER BY created_at DESC LIMIT 5000`);
  res.set('Cache-Control', 'public, max-age=600').json(rows);
});

app.get('/api/jobs/:id', async (req, res) => {
  const { rows } = await q(
    `SELECT j.*, u.name AS employer_name FROM jobs j JOIN users u ON u.id = j.employer_id WHERE j.id = $1`,
    [num(req.params.id)]
  );
  rows[0] ? res.json((await forViewer(req, rows))[0]) : res.status(404).json({ error: 'Job not found' });
});

// Validates a job post (create or edit). Returns { error } or the cleaned fields in column order.
// Generous for any real job post, and keeps what the AI analyzer reads (and pays for) bounded.
// Too long is an error rather than a silent cut, so nobody loses the end of their post.
export const JOB_TITLE_MAX = 120;
export const JOB_DESCRIPTION_MAX = 10_000;
function jobFields(body) {
  const tooLong = (v, max) => typeof v === 'string' && v.trim().length > max;
  if (tooLong(body.title, JOB_TITLE_MAX)) return { error: `Job title is too long (max ${JOB_TITLE_MAX} characters)` };
  if (tooLong(body.description, JOB_DESCRIPTION_MAX)) return { error: `Description is too long (max ${JOB_DESCRIPTION_MAX.toLocaleString('en-US')} characters)` };
  const title = str(body.title, JOB_TITLE_MAX);
  const description = str(body.description, JOB_DESCRIPTION_MAX);
  const { job_type } = body;
  // Pay in USD with cents, per hour / month / year, or a fixed price for the whole job.
  const money = (v) => (num(v) == null ? null : Math.round(num(v) * 100) / 100);
  const salary_min = money(body.salary_min);
  const salary_max = money(body.salary_max);
  const salary_period = body.salary_period ?? 'month';
  if (!PERIODS.includes(salary_period)) return { error: 'Invalid pay period' };
  if ([salary_min, salary_max].some((v) => v != null && (v < 0 || v > 10_000_000))) return { error: 'Salary must be between 0 and 10,000,000' };
  if (!title || !description) return { error: 'Title and description required' };
  if (!TYPES.includes(job_type)) return { error: 'Invalid job type' };
  if (salary_min != null && salary_max != null && salary_min > salary_max) return { error: 'Min salary is above max' };
  // Optional cap the employer sets ("up to 50 applications"); empty means the site-wide most.
  const max_applications = body.max_applications == null || body.max_applications === '' ? null : Number(body.max_applications);
  if (max_applications !== null && !(Number.isInteger(max_applications) && max_applications >= 1 && max_applications <= 5000))
    return { error: 'Application limit must be a whole number from 1 up' };
  return { values: [title, description, skillList(body.skills), job_type, salary_min, salary_max, salary_period, max_applications] };
}

// ponytail: deleting a job frees its slot for the month; keep deleted jobs (soft delete) if that gets abused.
const postLimitMessage = (plan, max) => `You've posted ${max} jobs this month, the most on the ${PLAN_LIMITS[plan].name} plan. ` +
  (plan === 'free' ? 'Upgrade to Pro for 5 a month or Premium for 10, or wait' : plan === 'pro' ? 'Upgrade to Premium for 10 a month, or wait' : 'Wait')
  + ' until the 1st, when your limit resets.';

app.post('/api/jobs', requireAuth('employer'), throttle(30, 60 * 60_000, 'an hour', perUser), async (req, res) => {
  const { rows: [me] } = await q('SELECT email_verified_at FROM users WHERE id = $1', [req.user.id]);
  if (!me.email_verified_at) return res.status(403).json({ error: 'Please confirm your email before posting a job. We sent you a link; check your inbox (and Spam).', code: 'verify_email' });
  const { error, values } = jobFields(req.body);
  if (error) return bad(res, error);
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    // Lock the employer's row so parallel posts can't slip past the monthly limit.
    await db.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
    const plan = await planOf(db, req.user.id);
    const max = PLAN_LIMITS[plan].posts;
    const { rows: [{ posted }] } = await db.query(
      `SELECT count(*)::int AS posted FROM jobs WHERE employer_id = $1 AND created_at >= ${MONTH_PH}`, [req.user.id]);
    if (posted >= max) {
      await db.query('ROLLBACK');
      return res.status(402).json({ error: postLimitMessage(plan, max), upgrade: plan !== 'premium' });
    }
    const { rows } = await db.query(
      `INSERT INTO jobs (employer_id, title, description, skills, job_type, salary_min, salary_max, salary_period, max_applications)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.user.id, ...values]
    );
    await db.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
});

// How many jobs the employer can still post this month, for the post-a-job page.
app.get('/api/my/job-quota', requireAuth('employer'), async (req, res) => {
  const plan = await planOf(pool, req.user.id);
  const { rows: [{ posted }] } = await q(
    `SELECT count(*)::int AS posted FROM jobs WHERE employer_id = $1 AND created_at >= ${MONTH_PH}`, [req.user.id]);
  const max = PLAN_LIMITS[plan].posts;
  res.json({ plan, posted, limit: max, remaining: Math.max(0, max - posted), message: posted >= max ? postLimitMessage(plan, max) : null });
});

app.put('/api/jobs/:id', requireAuth('employer'), throttle(60, 60 * 60_000, 'an hour', perUser), async (req, res) => {
  const { error, values } = jobFields(req.body);
  if (error) return bad(res, error);
  // Lowering the limit to (or below) the applications already in closes the job, as reaching it would.
  const { rows } = await q(
    `UPDATE jobs SET title = $3, description = $4, skills = $5, job_type = $6, salary_min = $7, salary_max = $8, salary_period = $9,
       max_applications = $10, updated_at = now(),
       closed_at = CASE WHEN $10::int IS NOT NULL AND (SELECT count(*) FROM applications WHERE job_id = $1) >= $10 THEN coalesce(closed_at, now()) ELSE closed_at END
     WHERE id = $1 AND employer_id = $2 RETURNING *`,
    [num(req.params.id), req.user.id, ...values]
  );
  rows[0] ? res.json(rows[0]) : res.status(404).json({ error: 'Job not found' });
});

// Closing stops new applications and hides the job from search; applicants and messages stay.
app.put('/api/jobs/:id/closed', requireAuth('employer'), async (req, res) => {
  if (typeof req.body.closed !== 'boolean') return bad(res, 'closed must be true or false');
  if (!req.body.closed) { // a full job stays closed
    const { max_job_applications } = await getSettings();
    const { rows: [n] } = await q(
      'SELECT j.max_applications, (SELECT count(*)::int FROM applications a WHERE a.job_id = j.id) AS received FROM jobs j WHERE j.id = $1 AND j.employer_id = $2',
      [num(req.params.id), req.user.id]);
    if (n && n.received >= max_job_applications) return res.status(409).json({ error: `This job has ${n.received} applicants, the most a job can take (${max_job_applications}). Post a new job to keep hiring.` });
    if (n?.max_applications && n.received >= n.max_applications) return res.status(409).json({ error: `This job reached your limit of ${n.max_applications} applications. Raise the limit in Edit job to reopen it.` });
  }
  const { rows } = await q(
    'UPDATE jobs SET closed_at = CASE WHEN $3 THEN coalesce(closed_at, now()) END WHERE id = $1 AND employer_id = $2 RETURNING *',
    [num(req.params.id), req.user.id, req.body.closed]
  );
  rows[0] ? res.json(rows[0]) : res.status(404).json({ error: 'Job not found' });
});

app.delete('/api/jobs/:id', requireAuth('employer'), async (req, res) => {
  const { rowCount } = await q('DELETE FROM jobs WHERE id = $1 AND employer_id = $2', [num(req.params.id), req.user.id]);
  rowCount ? res.status(204).end() : res.status(404).json({ error: 'Job not found' });
});

// --- Settings & admin ---
// Public: only what the site needs to render.
app.get('/api/settings', async (req, res) => {
  const { topups_enabled, max_job_applications } = await getSettings();
  res.json({ topups_enabled, max_job_applications });
});

const adminFails = limiter(5, 15 * 60_000, true); // always strict, even in tests

app.post('/api/admin/login', async (req, res) => {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return res.status(503).json({ error: 'Admin login is not set up' });
  if (adminFails.blocked(visitor(req))) return tooMany(res, '15 minutes');
  const ok = sameText(str(req.body.email).toLowerCase(), ADMIN_EMAIL.toLowerCase()) & sameText(req.body.password ?? '', ADMIN_PASSWORD);
  if (!ok) {
    adminFails.hit(visitor(req));
    return res.status(401).json({ error: 'Wrong email or password' });
  }
  adminFails.clear(visitor(req));
  startAdminSession(req, res);
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  endAdminSession(req, res);
  res.status(204).end();
});

app.get('/api/admin/settings', requireAdmin, async (req, res) => res.json(await getSettings()));

// Numbers for the admin dashboard. "Active" means signed in and using the site.
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  const live = (sql) => sql.replace(/FROM users( WHERE)?/, (_, where) => `FROM users WHERE deleted_at IS NULL${where ? ' AND' : ''}`); // skip deleted accounts
  const count = (sql) => `(SELECT count(*)::int ${live(sql)})`;
  const since = (col, period) => `${col} > now() - interval '${period}'`;
  const { rows: [totals] } = await q(`SELECT
    ${count("FROM users")} AS users,
    ${count("FROM users WHERE role = 'worker'")} AS workers,
    ${count("FROM users WHERE role = 'employer'")} AS employers,
    ${count(`FROM users WHERE ${since('created_at', '1 day')}`)} AS new_24h,
    ${count(`FROM users WHERE ${since('created_at', '7 days')}`)} AS new_7d,
    ${count("FROM users WHERE google_sub IS NOT NULL")} AS google_users,
    ${count("FROM users WHERE role = 'employer' AND plan <> 'free'")} AS paid_employers,
    ${count(`FROM users WHERE ${since('last_seen_at', '5 minutes')}`)} AS active_now,
    ${count(`FROM users WHERE ${since('last_seen_at', '1 day')}`)} AS active_24h,
    ${count(`FROM users WHERE ${since('last_seen_at', '7 days')}`)} AS active_7d,
    ${count("FROM worker_profiles WHERE title <> ''")} AS profiles_completed,
    ${count("FROM worker_profiles WHERE resume_key IS NOT NULL")} AS resumes,
    (SELECT count(DISTINCT worker_id)::int FROM applications) AS workers_applied,
    ${count("FROM applications")} AS applications,
    ${count(`FROM applications WHERE ${since('created_at', '7 days')}`)} AS applications_7d,
    ${count("FROM ai_analyses")} AS ai_analyses,
    ${count(`FROM ai_analyses WHERE ${since('created_at', '7 days')}`)} AS ai_analyses_7d,
    ${count("FROM feedback WHERE done_at IS NULL")} AS open_feedback,
    (SELECT count(DISTINCT employer_id)::int FROM jobs) AS employers_posted,
    ${count("FROM jobs")} AS jobs,
    ${count("FROM jobs WHERE closed_at IS NULL")} AS open_jobs,
    ${count(`FROM jobs WHERE ${since('created_at', '7 days')}`)} AS jobs_7d,
    ${count("FROM messages")} AS messages,
    ${count(`FROM messages WHERE ${since('created_at', '7 days')}`)} AS messages_7d`);
  // Sign-ups per day for the last 30 days, Philippine time.
  const { rows: signups } = await q(`SELECT to_char(d, 'YYYY-MM-DD') AS day,
      count(u.id) FILTER (WHERE u.role = 'worker')::int AS workers,
      count(u.id) FILTER (WHERE u.role = 'employer')::int AS employers
    FROM generate_series((now() AT TIME ZONE 'Asia/Manila')::date - 29, (now() AT TIME ZONE 'Asia/Manila')::date, interval '1 day') d
    LEFT JOIN users u ON (u.created_at AT TIME ZONE 'Asia/Manila')::date = d::date
    GROUP BY d ORDER BY d`);
  const { rows: countries } = await q(`SELECT coalesce(last_country, '??') AS country, count(*)::int AS users
    FROM users WHERE deleted_at IS NULL AND ${since('last_seen_at', '30 days')} GROUP BY 1 ORDER BY 2 DESC LIMIT 15`);
  const { rows: recent } = await q('SELECT id, name, role, created_at, last_seen_at, last_country FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 10');
  res.json({ totals, signups, countries, recent });
});

app.put('/api/admin/settings', requireAdmin, async (req, res) => {
  const changes = Object.entries(req.body ?? {});
  for (const [k, v] of changes) {
    if (!SETTINGS[k]) return bad(res, `Unknown setting: ${k}`);
    if (!SETTINGS[k].valid(v)) return bad(res, `Invalid value for ${k}`);
  }
  for (const [k, v] of changes) {
    await q('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()', [k, JSON.stringify(v)]);
  }
  res.json(await getSettings());
});

// --- Applications ---
app.post('/api/jobs/:id/apply', requireAuth('worker'), async (req, res) => {
  const cover_letter = str(req.body.cover_letter);
  const credits = req.body.credits == null ? 1 : Number(req.body.credits);
  if (!cover_letter) return bad(res, 'Cover letter required');
  // Credits are optional: 0 still applies, it just ranks below applicants who bid.
  if (!Number.isInteger(credits) || credits < 0 || credits > DAILY_CREDITS)
    return bad(res, `Credits must be a whole number from 0 to ${DAILY_CREDITS}`);

  // Read settings before taking a connection: inside the transaction it would need a second one, and a
  // burst of applies holding every pooled connection would wait on each other forever.
  const { daily_applications, max_job_applications } = await getSettings();
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    // Lock this worker's row so parallel applies can't overspend today's credits, and the job's row so
    // parallel applies can't push it past its cap.
    await db.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
    const { rows: [target] } = await db.query(
      'SELECT j.closed_at, j.max_applications, u.deactivated_at, u.suspended_at FROM jobs j JOIN users u ON u.id = j.employer_id WHERE j.id = $1 FOR UPDATE OF j', [num(req.params.id)]);
    // Counted after the lock, in its own statement, so it sees applies that committed while we waited.
    const { rows: [{ received }] } = await db.query('SELECT count(*)::int AS received FROM applications WHERE job_id = $1', [num(req.params.id)]);
    if (target?.closed_at || target?.deactivated_at || target?.suspended_at) {
      await db.query('ROLLBACK');
      return res.status(409).json({ error: 'This job is closed and no longer accepting applications' });
    }
    const dup = await db.query('SELECT 1 FROM applications WHERE job_id = $1 AND worker_id = $2', [num(req.params.id), req.user.id]);
    if (dup.rowCount) {
      await db.query('ROLLBACK');
      return res.status(409).json({ error: 'You already applied' });
    }
    const { remaining, applications } = await creditsToday(db, req.user.id);
    // The job's own limit, if the employer set one, else the site-wide most.
    const cap = Math.min(max_job_applications, target?.max_applications ?? Infinity);
    if (target && received >= cap) { // full before this change, or the cap was lowered
      await db.query('UPDATE jobs SET closed_at = now() WHERE id = $1', [num(req.params.id)]);
      await db.query('COMMIT');
      return res.status(409).json({ error: 'This job is full and no longer accepting applications' });
    }
    if (applications >= daily_applications) {
      await db.query('ROLLBACK');
      return res.status(429).json({ error: `You can send up to ${daily_applications} applications a day. Try again after midnight.` });
    }
    if (credits > remaining) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: `You have ${remaining} credits left today` });
    }
    const { rows } = await db.query(
      `INSERT INTO applications (job_id, worker_id, cover_letter, credits, resume_attached)
       SELECT j.id, $2, $3, $4, $5 AND p.resume_key IS NOT NULL
       FROM jobs j LEFT JOIN worker_profiles p ON p.user_id = $2
       WHERE j.id = $1
       ON CONFLICT (job_id, worker_id) DO NOTHING RETURNING id, job_id, credits, resume_attached, created_at`,
      [num(req.params.id), req.user.id, cover_letter, credits, req.body.attach_resume !== false]
    );
    // The application that fills the job closes it: it leaves search and stops taking more.
    if (rows[0] && received + 1 >= cap) await db.query('UPDATE jobs SET closed_at = now() WHERE id = $1', [num(req.params.id)]);
    await db.query('COMMIT');
    if (rows[0]) return res.status(201).json(rows[0]);
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
  const exists = await q('SELECT 1 FROM jobs WHERE id = $1', [num(req.params.id)]);
  exists.rowCount ? res.status(409).json({ error: 'You already applied' }) : res.status(404).json({ error: 'Job not found' });
});

// The signed-in worker's application to this job, if any, so the job page can show it instead of the form.
app.get('/api/jobs/:id/my-application', requireAuth('worker'), async (req, res) => {
  const { rows } = await q(
    'SELECT id, cover_letter, credits, resume_attached, created_at FROM applications WHERE job_id = $1 AND worker_id = $2',
    [num(req.params.id), req.user.id]
  );
  res.json({ application: rows[0] ?? null });
});

app.get('/api/credits', requireAuth('worker'), async (req, res) => {
  res.json(await creditsToday(pool, req.user.id));
});

// Everyone can apply whatever the employer's plan; the employer sees their top applicants up to the
// plan's limit (`total` counts everyone, so the page can say how many are waiting behind an upgrade).
app.get('/api/jobs/:id/applications', requireAuth('employer'), async (req, res) => {
  const plan = await planOf(pool, req.user.id);
  const limit = PLAN_LIMITS[plan].applicants;
  const { rows } = await q(
    `SELECT a.id, a.cover_letter, a.credits, a.analysis, a.analyzed_at, CASE WHEN a.resume_attached THEN p.resume_name END AS resume_name, a.created_at, u.id AS worker_id, u.name, u.email, p.title, p.skills,
       u.deleted_at IS NOT NULL AS deleted, u.deactivated_at IS NOT NULL AS deactivated, p.hourly_rate,
       EXISTS (SELECT 1 FROM messages m WHERE m.sender_id = $2 AND m.recipient_id = u.id) AS messaged,
       EXISTS (SELECT 1 FROM hires h WHERE h.employer_id = $2 AND h.worker_id = u.id) AS hired,
       EXISTS (SELECT 1 FROM saved_workers s WHERE s.employer_id = $2 AND s.worker_id = u.id) AS saved,
       (SELECT count(*)::int FROM applications x WHERE x.job_id = a.job_id) AS total
     FROM applications a JOIN jobs j ON j.id = a.job_id
     JOIN users u ON u.id = a.worker_id LEFT JOIN worker_profiles p ON p.user_id = u.id
     WHERE a.job_id = $1 AND j.employer_id = $2 AND ($3::int IS NULL OR ${RANK} < $3) ORDER BY a.credits DESC, a.created_at ASC, a.id`,
    [num(req.params.id), req.user.id, limit]
  );
  // Opening the list counts as seeing every applicant so far (clears this job from the 🔔).
  await q('UPDATE jobs SET applicants_seen_at = now() WHERE id = $1 AND employer_id = $2', [num(req.params.id), req.user.id]);
  res.json({ applicants: rows.map(({ total: _, ...a }) => a), total: rows[0]?.total ?? 0, limit, plan });
});

// The dashboard's "Latest applicants": newest applications across the employer's jobs, only ones their plan
// lets them see (the same top-N-per-job rule as the applicants page).
app.get('/api/my/recent-applicants', requireAuth('employer'), async (req, res) => {
  const limit = PLAN_LIMITS[await planOf(pool, req.user.id)].applicants;
  const { rows } = await q(
    `SELECT a.id, a.created_at, a.job_id, j.title AS job_title, u.id AS worker_id, u.name, p.title
     FROM applications a JOIN jobs j ON j.id = a.job_id JOIN users u ON u.id = a.worker_id LEFT JOIN worker_profiles p ON p.user_id = u.id
     WHERE j.employer_id = $1 AND u.deleted_at IS NULL AND ($2::int IS NULL OR ${RANK} < $2)
     ORDER BY a.created_at DESC, a.id DESC LIMIT 6`, [req.user.id, limit]);
  res.json(rows);
});

// --- Website visits (Admin › Visitors) ---
// The site reports each page it shows; the IP and Cloudflare's country come from the request.
const BOT_UA = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python|axios/i;
const VISIT_DAYS = 90;
app.post('/api/track', throttle(120, 60_000, 'a minute'), async (req, res) => {
  const path = str(req.body?.path, 300);
  const ua = str(req.get('user-agent'), 300);
  if (!path.startsWith('/') || path.startsWith('/admin') || !ua || BOT_UA.test(ua)) return res.status(204).end();
  const country = req.get('cf-ipcountry');
  const ref = str(req.body?.referrer, 300);
  const me = await signedInUser(req);
  await q('INSERT INTO page_views (ip, country, path, referrer, user_id, user_agent) VALUES ($1, $2, $3, $4, $5, $6)',
    [visitor(req), /^[A-Z]{2}$/.test(country ?? '') ? country : null, path, /^https?:\/\//.test(ref) ? ref : null, me?.id ?? null, ua]);
  if (Math.random() < 0.01) q(`DELETE FROM page_views WHERE at < now() - interval '${VISIT_DAYS} days'`).catch((err) => console.error(err));
  res.status(204).end();
});

// "Mobile · Chrome" from a browser's user-agent text, good enough for a glance.
const deviceOf = (ua = '') => `${/iPad|Tablet/i.test(ua) ? 'Tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'Mobile' : 'Desktop'} · ${
  /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Other'}`;
app.get('/api/admin/visitors', requireAdmin, async (req, res) => {
  const since = (d) => `at > now() - interval '${d}'`;
  const { rows: [totals] } = await q(`SELECT
    count(*) FILTER (WHERE ${since('1 day')})::int AS views_24h, count(DISTINCT ip) FILTER (WHERE ${since('1 day')})::int AS visitors_24h,
    count(*) FILTER (WHERE ${since('7 days')})::int AS views_7d, count(DISTINCT ip) FILTER (WHERE ${since('7 days')})::int AS visitors_7d,
    count(*) FILTER (WHERE ${since('30 days')})::int AS views_30d, count(DISTINCT ip) FILTER (WHERE ${since('30 days')})::int AS visitors_30d
    FROM page_views`);
  const { rows: countries } = await q(`SELECT coalesce(country, '??') AS country, count(DISTINCT ip)::int AS visitors
    FROM page_views WHERE ${since('30 days')} GROUP BY 1 ORDER BY 2 DESC LIMIT 15`);
  const { rows: pages } = await q(`SELECT path, count(*)::int AS views, count(DISTINCT ip)::int AS visitors
    FROM page_views WHERE ${since('7 days')} GROUP BY 1 ORDER BY 2 DESC LIMIT 15`);
  const size = sizeOf(req);
  const { rows } = await q(`SELECT v.id, v.at, v.ip, v.country, v.path, v.referrer, v.user_agent, u.id AS user_id, u.name AS user_name, u.role AS user_role,
      count(*) OVER ()::int AS total
    FROM page_views v LEFT JOIN users u ON u.id = v.user_id ORDER BY v.at DESC, v.id DESC LIMIT $1 OFFSET $2`, [size, pageOf(req) * size]);
  res.json({
    totals, countries, pages, keep_days: VISIT_DAYS,
    total: rows[0]?.total ?? 0,
    visits: rows.map(({ total: _, user_agent, ...v }) => ({ ...v, device: deviceOf(user_agent ?? '') })),
  });
});

// The Applicants page: everyone who applied to any of this employer's jobs (only those their plan shows),
// newest first, with where each one stands. Opening it counts as seeing them (clears the 🔔).
app.get('/api/my/applicants', requireAuth('employer'), async (req, res) => {
  const limit = PLAN_LIMITS[await planOf(pool, req.user.id)].applicants;
  const { rows } = await q(
    `SELECT a.id, a.created_at, a.credits, (a.analysis->>'score')::int AS score, a.job_id, j.title AS job_title,
       u.id AS worker_id, u.name, p.title, p.hourly_rate, u.deleted_at IS NOT NULL AS deleted, u.deactivated_at IS NOT NULL AS deactivated,
       a.created_at > j.applicants_seen_at AS is_new,
       EXISTS (SELECT 1 FROM messages m WHERE m.sender_id = $1 AND m.recipient_id = u.id) AS messaged,
       EXISTS (SELECT 1 FROM hires h WHERE h.employer_id = $1 AND h.worker_id = u.id) AS hired,
       ${RANK} < coalesce($2::int, 2147483647) AS visible
     FROM applications a JOIN jobs j ON j.id = a.job_id JOIN users u ON u.id = a.worker_id LEFT JOIN worker_profiles p ON p.user_id = u.id
     WHERE j.employer_id = $1 ORDER BY a.created_at DESC, a.id DESC LIMIT 1000`, [req.user.id, limit]);
  await q('UPDATE jobs SET applicants_seen_at = now() WHERE employer_id = $1', [req.user.id]);
  const visible = rows.filter((r) => r.visible).map(({ visible: _, ...r }) => r);
  res.json({ applicants: visible, hidden: rows.length - visible.length, bulk_max: BULK_MAX });
});

// Job posts used this month against the plan's limit (the dashboard shows "1 of 3 used").
app.get('/api/my/post-usage', requireAuth('employer'), async (req, res) => {
  const plan = await planOf(pool, req.user.id);
  const { rows: [{ used }] } = await q(`SELECT count(*)::int AS used FROM jobs WHERE employer_id = $1 AND created_at >= ${MONTH_PH}`, [req.user.id]);
  res.json({ used, limit: PLAN_LIMITS[plan].posts });
});

// The 🔔 in the menu bar: applications since the employer last opened each job's applicants, newest job first.
app.get('/api/my/new-applicants', requireAuth('employer'), async (req, res) => {
  const { rows } = await q(
    `SELECT j.id, j.title, count(*)::int AS count, max(a.created_at) AS latest
     FROM jobs j JOIN applications a ON a.job_id = j.id AND a.created_at > j.applicants_seen_at
     WHERE j.employer_id = $1 GROUP BY j.id ORDER BY latest DESC LIMIT 20`, [req.user.id]);
  res.json({ count: rows.reduce((n, j) => n + j.count, 0), jobs: rows });
});

app.get('/api/my/jobs', requireAuth('employer'), async (req, res) => {
  const { rows } = await q(
    `SELECT j.*,
       (SELECT count(*)::int FROM applications a WHERE a.job_id = j.id) AS applicant_count,
       (SELECT count(*)::int FROM applications a WHERE a.job_id = j.id AND a.created_at > now() - interval '7 days') AS new_count,
       (SELECT count(*)::int FROM applications a WHERE a.job_id = j.id AND a.analysis IS NOT NULL) AS analyzed_count,
       (SELECT max(a.created_at) FROM applications a WHERE a.job_id = j.id) AS last_applied_at,
       (SELECT coalesce(json_agg(u.name ORDER BY t.credits DESC, t.created_at), '[]')
          FROM (SELECT worker_id, credits, created_at FROM applications WHERE job_id = j.id ORDER BY credits DESC, created_at LIMIT 3) t
          JOIN users u ON u.id = t.worker_id AND u.deleted_at IS NULL) AS top_applicants
     FROM jobs j WHERE employer_id = $1 ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
});

app.get('/api/my/applications', requireAuth('worker'), async (req, res) => {
  const { rows } = await q(
    // Status for the worker's dashboard: hired by this employer (for this job or in general), messaged by
    // them, or the job has closed.
    `SELECT a.id, a.credits, a.created_at, j.id AS job_id, j.title, j.closed_at, u.id AS employer_id, u.name AS employer_name,
       EXISTS (SELECT 1 FROM hires h WHERE h.employer_id = j.employer_id AND h.worker_id = a.worker_id AND (h.job_id = j.id OR h.job_id IS NULL)) AS hired,
       EXISTS (SELECT 1 FROM messages m WHERE m.sender_id = j.employer_id AND m.recipient_id = a.worker_id) AS messaged
     FROM applications a JOIN jobs j ON j.id = a.job_id JOIN users u ON u.id = j.employer_id
     WHERE a.worker_id = $1 ORDER BY a.created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
});

// --- Workers ---
const WORKER_SELECT = `SELECT u.id, u.name, p.title, p.bio, p.skills, p.hourly_rate, p.availability, p.portfolio_url, p.linkedin_url, p.updated_at,
    p.skill_years, p.location, p.work_hours, p.hours_per_week, p.start_when, p.english, p.languages, p.internet_mbps, p.setup, p.show_resume,
    to_char(p.birth_date, 'YYYY-MM-DD') AS birth_date, date_part('year', age(p.birth_date))::int AS age, p.gender,
    (p.resume_key IS NOT NULL AND p.show_resume) AS has_resume, u.created_at AS member_since, u.last_seen_at,
    u.deactivated_at IS NOT NULL AS deactivated, u.email_verified_at IS NOT NULL AS email_verified, u.photo_key IS NOT NULL AS has_photo,
    (coalesce(p.portfolio_url, '') <> '' OR coalesce(p.linkedin_url, '') <> '') AS has_links -- trust checks; the links stay hidden from limited views
  FROM users u JOIN worker_profiles p ON p.user_id = u.id`;

// A worker's surname, LinkedIn and portfolio would let an employer find them elsewhere and skip both the
// upgrade and our messaging. So an employer sees them only once they may contact the worker here anyway:
// on a paid plan, or when the worker applied to one of their jobs, or they already have a conversation.
// Everyone else sees "Maria S." and no links (`limited: true`, so the page can say how to see more).
export const shortName = (name) => {
  const [first, ...rest] = String(name).trim().split(/\s+/);
  return rest.length ? `${first} ${rest.at(-1)[0].toUpperCase()}.` : first;
};
async function revealFor(employerId, workerIds) {
  if (PLAN_LIMITS[await planOf(pool, employerId)].outreach) return () => true;
  const { rows } = await q(
    `SELECT a.worker_id AS id FROM applications a JOIN jobs j ON j.id = a.job_id WHERE j.employer_id = $1 AND a.worker_id = ANY($2)
     UNION SELECT recipient_id FROM messages WHERE sender_id = $1 AND recipient_id = ANY($2)
     UNION SELECT sender_id FROM messages WHERE recipient_id = $1 AND sender_id = ANY($2)`,
    [employerId, workerIds]);
  const known = new Set(rows.map((r) => r.id));
  return (id) => known.has(id);
}
// Contact details written into a headline or bio (emails, links, phone numbers, @handles) are swapped for
// HIDDEN before the text leaves the server; the page shows a blurred "upgrade to see" in their place.
export const HIDDEN = '[hidden: upgrade to see]';
const CONTACT_RE = new RegExp([
  EMAIL.source,
  String.raw`(?:https?:\/\/|www\.)[^\s,;)]+`, // a link ends at a space, comma, semicolon or bracket
  String.raw`\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|ph|io|dev|me|co|org|app|link|site|xyz|info|biz)(?:\/[^\s,;)]*)?`,
  String.raw`(?:\+?\d[\d\s().-]{7,}\d)`,
  String.raw`(?<![\w.])@[a-z0-9_.]{2,}[a-z0-9_](?![\w.]*@)`, // an @handle (never ending in a full stop), not the start of an email
].join('|'), 'gi');
// Number runs only count as a phone number with 10+ digits, so "2024-2025" or "1,300" stay readable.
const PHONE = /^\+?\d[\d\s().-]{7,}\d$/;
export const hideContacts = (text, mark = HIDDEN) => String(text ?? '').replace(CONTACT_RE,
  (m) => (PHONE.test(m) && m.replace(/\D/g, '').length < 10 ? m : mark));
const limitWorker = (w, fullName = false) => ({
  ...w, name: fullName ? w.name : shortName(w.name), name_hidden: !fullName, title: hideContacts(w.title), bio: hideContacts(w.bio),
  location: hideContacts(w.location), languages: hideContacts(w.languages),
  portfolio_url: null, linkedin_url: null, limited: true,
});

// How one employer sees these workers: in full, or limited (the admin can let Free employers see full names).
// Never the birth date itself; the age is enough.
async function workerViews(employerId, ids) {
  const full = await revealFor(employerId, ids);
  const { free_full_names } = await getSettings();
  return ({ birth_date: _, ...w }) => (full(w.id) ? w : limitWorker(w, free_full_names));
}

// Talent isn't public: only signed-in employers can browse workers (workers can load their own profile).
// Search title, bio and skills; filter by skills (all of them), availability, hourly rate and how recently
// they were active; sort; 20 per page. Names aren't searchable, so a hidden surname can't be confirmed.
const WORKER_SORTS = {
  active: 'u.last_seen_at DESC NULLS LAST, p.updated_at DESC',
  rate: 'p.hourly_rate ASC NULLS LAST, u.last_seen_at DESC NULLS LAST',
  newest: 'u.created_at DESC',
};
// A search box's words as Postgres regexes: special characters taken literally, matched at word starts
// (\m), and short words (ai, va, seo) only as whole words (\M). Up to 6 words.
export const searchWords = (q) => [...new Set(str(q, 100).toLowerCase().split(/[\s,;/]+/).filter(Boolean))].slice(0, 6)
  .map((w) => `${/^\w/.test(w) ? '\\m' : ''}${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${w.length <= 3 && /\w$/.test(w) ? '\\M' : ''}`);
// Hire Talent's filters, shared by the page and the AI matcher. Adds its values to `params`.
function workerFilters(query, params) {
  const add = (v) => { params.push(v); return `$${params.length}`; };
  const where = ["p.title <> ''", 'u.deactivated_at IS NULL', 'u.suspended_at IS NULL']; // paused and suspended accounts stay out of search
  // Every word must appear in the title, bio or skills (any order, any field; never the resume). Whole words,
  // so "ai" doesn't match "email"; words of 4+ letters also match longer forms ("engineer" → "engineering").
  const words = searchWords(query.q);
  let match = '';
  if (words.length) {
    const ts = words.map((w) => add(w));
    for (const t of ts) where.push(`(p.title ~* ${t} OR p.bio ~* ${t} OR EXISTS (SELECT 1 FROM unnest(p.skills) s WHERE s ~* ${t}))`);
    match = `(${ts.map((t) => `(p.title ~* ${t})::int`).join(' + ')}) DESC, `; // more words in the title first
  }
  const skills = skillList(query.skills ?? query.skill).slice(0, 10);
  if (skills.length) where.push(`p.skills @> ${add(skills)}::text[]`);
  if (TYPES.includes(query.availability)) where.push(`p.availability = ${add(query.availability)}`);
  if (num(query.rate_min) !== null) where.push(`p.hourly_rate >= ${add(num(query.rate_min))}`);
  if (num(query.rate_max) !== null) where.push(`p.hourly_rate <= ${add(num(query.rate_max))}`);
  if ([1, 7, 30].includes(num(query.active))) where.push(`u.last_seen_at > now() - ${add(num(query.active))} * interval '1 day'`);
  return { where, match, add };
}
app.get('/api/workers', requireAuth('employer'), async (req, res) => {
  const params = [req.user.id];
  const { where, match, add } = workerFilters(req.query, params);
  const sort = WORKER_SORTS[req.query.sort] ?? WORKER_SORTS.active;
  const { rows } = await q(
    `${WORKER_SELECT.replace(' FROM users u', `, EXISTS (SELECT 1 FROM saved_workers s WHERE s.employer_id = $1 AND s.worker_id = u.id) AS saved,
       count(*) OVER ()::int AS total FROM users u`)}
     WHERE ${where.join(' AND ')} ORDER BY ${match}${sort} LIMIT ${PAGE_SIZE} OFFSET ${add(pageOf(req) * PAGE_SIZE)}`,
    params);
  const view = await workerViews(req.user.id, rows.map((w) => w.id));
  // past the last page there's no row to carry the total, so count separately
  const total = rows[0]?.total ?? (pageOf(req) ? (await q(
    `SELECT count(*)::int AS n FROM users u JOIN worker_profiles p ON p.user_id = u.id WHERE $1::int IS NOT NULL AND ${where.join(' AND ')}`,
    params.slice(0, -1))).rows[0].n : 0);
  res.json({ workers: rows.map(({ total: _, ...w }) => view(w)), total, page_size: PAGE_SIZE });
});

app.get('/api/workers/:id', requireAuth(), async (req, res) => {
  if (req.user.role !== 'employer' && req.user.id !== num(req.params.id)) return res.status(403).json({ error: 'Only employers can view worker profiles' });
  const { rows: [w] } = await q(`${WORKER_SELECT} WHERE u.id = $1`, [num(req.params.id)]);
  if (!w) return res.status(404).json({ error: 'Worker not found' });
  if (req.user.id === w.id) return res.json(w);
  const { rows: [rel] } = await q(
    `SELECT EXISTS (SELECT 1 FROM saved_workers WHERE employer_id = $1 AND worker_id = $2) AS saved,
       (SELECT created_at FROM hires WHERE employer_id = $1 AND worker_id = $2) AS hired_at`, [req.user.id, w.id]);
  res.json({ ...(await workerViews(req.user.id, [w.id]))(w), ...rel });
});

// --- Saved workers (bookmarks) and hires ---
const isWorker = async (id) => (await q("SELECT 1 FROM users WHERE id = $1 AND role = 'worker'", [id])).rowCount > 0;

app.put('/api/saved/:workerId', requireAuth('employer'), async (req, res) => {
  const id = num(req.params.workerId);
  if (!(await isWorker(id))) return res.status(404).json({ error: 'Worker not found' });
  await q('INSERT INTO saved_workers (employer_id, worker_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user.id, id]);
  res.status(204).end();
});
app.delete('/api/saved/:workerId', requireAuth('employer'), async (req, res) => {
  await q('DELETE FROM saved_workers WHERE employer_id = $1 AND worker_id = $2', [req.user.id, num(req.params.workerId)]);
  res.status(204).end();
});
// Saved workers, most recently saved first (same privacy rules as search).
app.get('/api/saved', requireAuth('employer'), async (req, res) => {
  const { rows } = await q(
    `${WORKER_SELECT.replace(' FROM users u', ', true AS saved, s.created_at AS saved_at FROM users u')}
     JOIN saved_workers s ON s.worker_id = u.id AND s.employer_id = $1 ORDER BY s.created_at DESC LIMIT 200`, [req.user.id]);
  res.json(rows.map(await workerViews(req.user.id, rows.map((w) => w.id))));
});

// Mark as hired: only for someone the employer can already talk to here (applied, chatting, or a paid plan).
app.put('/api/hires/:workerId', requireAuth('employer'), async (req, res) => {
  const id = num(req.params.workerId);
  if (!(await isWorker(id))) return res.status(404).json({ error: 'Worker not found' });
  if (!(await revealFor(req.user.id, [id]))(id))
    return res.status(403).json({ error: 'You can mark someone as hired once they’ve applied to your job or you’ve talked with them.' });
  let jobId = req.body?.job_id == null ? null : num(req.body.job_id);
  if (jobId !== null && !(await q('SELECT 1 FROM jobs WHERE id = $1 AND employer_id = $2', [jobId, req.user.id])).rowCount) jobId = null;
  await q(`INSERT INTO hires (employer_id, worker_id, job_id) VALUES ($1, $2, $3)
           ON CONFLICT (employer_id, worker_id) DO UPDATE SET job_id = coalesce($3, hires.job_id)`, [req.user.id, id, jobId]);
  res.status(204).end();
});
app.delete('/api/hires/:workerId', requireAuth('employer'), async (req, res) => {
  await q('DELETE FROM hires WHERE employer_id = $1 AND worker_id = $2', [req.user.id, num(req.params.workerId)]);
  res.status(204).end();
});
app.get('/api/my/hires', requireAuth('employer'), async (req, res) => {
  const { rows } = await q(
    `SELECT u.id, u.name, p.title, h.created_at AS hired_at, j.id AS job_id, j.title AS job_title
     FROM hires h JOIN users u ON u.id = h.worker_id LEFT JOIN worker_profiles p ON p.user_id = u.id LEFT JOIN jobs j ON j.id = h.job_id
     WHERE h.employer_id = $1 ORDER BY h.created_at DESC`, [req.user.id]);
  res.json(rows);
});

// Optional profile link: blank is fine; otherwise a real http(s) URL ("linkedin.com/in/x" gets https:// added).
// Returns undefined when invalid. `host` limits it to one site, e.g. LinkedIn.
export function profileLink(v, host) {
  const text = str(v, 300);
  if (!text) return null;
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) return undefined;
    if (host && url.hostname !== host && !url.hostname.endsWith(`.${host}`)) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

app.put('/api/profile', requireAuth('worker'), async (req, res) => {
  const availability = req.body.availability;
  if (!TYPES.includes(availability)) return bad(res, 'Invalid availability');
  const portfolio = profileLink(req.body.portfolio_url);
  const linkedin = profileLink(req.body.linkedin_url, 'linkedin.com');
  if (portfolio === undefined) return bad(res, 'Portfolio link must be a web address, like https://yoursite.com');
  if (linkedin === undefined) return bad(res, 'LinkedIn link must be a linkedin.com address');
  const extra = bentoFields(req.body);
  if (typeof extra === 'string') return bad(res, extra);
  const skills = skillList(req.body.skills).slice(0, 10);
  // years only for skills still on the list
  if (extra.skill_years) extra.skill_years = JSON.stringify(Object.fromEntries(Object.entries(extra.skill_years).filter(([k]) => skills.includes(k))));
  const cols = Object.keys(extra);
  const { rows } = await q(
    `UPDATE worker_profiles SET title = $2, bio = $3, skills = $4, hourly_rate = $5, availability = $6,
       portfolio_url = $7, linkedin_url = $8, ${cols.map((c, i) => `${c} = $${i + 9}, `).join('')}updated_at = now()
     WHERE user_id = $1 RETURNING *`,
    [req.user.id, str(req.body.title, 200), str(req.body.bio), skills, num(req.body.hourly_rate), availability, portfolio, linkedin, ...Object.values(extra)]
  );
  res.json(rows[0]);
});

// The bento profile's optional fields. Only the ones sent are changed, so an older form can't wipe them.
// Returns the fields to save, or an error message.
const WORK_HOURS = ['ph', 'us', 'uk', 'au', 'flexible'];
const START_WHEN = ['now', '1w', '2w', '1m'];
const ENGLISH = ['basic', 'conversational', 'fluent', 'native'];
const SETUP = ['backup_power', 'backup_internet', 'own_computer', 'headset'];
const GENDERS = ['female', 'male', 'unsaid'];
export function bentoFields(body) {
  const out = {};
  const has = (k) => body[k] !== undefined;
  const choice = (k, list, label) => {
    if (!has(k)) return;
    if (body[k] === null || body[k] === '') out[k] = null;
    else if (list.includes(body[k])) out[k] = body[k];
    else return `Invalid ${label}`;
  };
  const int = (k, min, max, label) => {
    if (!has(k)) return;
    if (body[k] === null || body[k] === '') { out[k] = null; return; }
    const n = Number(body[k]);
    if (!Number.isInteger(n) || n < min || n > max) return `${label} must be a whole number from ${min} to ${max}`;
    out[k] = n;
  };
  const err = choice('work_hours', WORK_HOURS, 'working hours') ?? choice('start_when', START_WHEN, 'start date') ?? choice('english', ENGLISH, 'English level')
    ?? int('hours_per_week', 1, 80, 'Hours per week') ?? int('internet_mbps', 1, 10000, 'Internet speed')
    ?? choice('gender', GENDERS, 'gender');
  if (err) return err;
  if (has('birth_date')) {
    if (!body.birth_date) out.birth_date = null;
    else {
      const d = /^\d{4}-\d{2}-\d{2}$/.test(body.birth_date) ? new Date(`${body.birth_date}T00:00:00Z`) : null;
      const years = d && !isNaN(d) && (Date.now() - d) / (365.25 * 86_400_000);
      if (!(years >= 18 && years < 100)) return 'Birth date must be a real date, and you must be at least 18';
      out.birth_date = body.birth_date;
    }
  }
  if (has('location')) out.location = str(body.location, 80) ?? '';
  if (has('languages')) out.languages = str(body.languages, 100) ?? '';
  if (has('setup')) out.setup = SETUP.filter((x) => Array.isArray(body.setup) && body.setup.includes(x));
  if (has('show_resume')) out.show_resume = body.show_resume !== false;
  if (has('skill_years')) {
    const years = {};
    for (const [k, v] of Object.entries(body.skill_years && typeof body.skill_years === 'object' ? body.skill_years : {})) {
      const n = Number(v);
      if (Number.isInteger(n) && n >= 0 && n <= 50) years[String(k).trim().toLowerCase().slice(0, 50)] = n; // same keys as skillList
    }
    out.skill_years = years;
  }
  return out;
}

// A worker's CV, from their profile (when they chose to show it). It usually has their contact details,
// so an employer gets it only once they may contact the worker anyway (see revealFor).
app.get('/api/workers/:id/resume', requireAuth(), async (req, res) => {
  const id = num(req.params.id);
  if (req.user.role !== 'employer' && req.user.id !== id) return res.status(403).json({ error: 'Only employers can view worker profiles' });
  const { rows: [p] } = await q('SELECT resume_key, resume_name, show_resume FROM worker_profiles WHERE user_id = $1', [id]);
  if (!p?.resume_key || !p.show_resume) return res.status(404).json({ error: 'This worker hasn’t shared a resume' });
  if (req.user.id !== id && !(await revealFor(req.user.id, [id]))(id))
    return res.status(403).json({ error: 'Upgrade to Pro to download resumes', code: 'upgrade' });
  res.json({ name: p.resume_name, url: await app.locals.storage.signedUrl(p.resume_key, p.resume_name) });
});

// --- AI application analyzer (employers) ---
app.locals.analyzeApplication = analyzeApplication; // swappable so tests don't call the real AI

// AI runs this calendar month (Philippine time), re-analyses included; they reset on the 1st.
async function analyzerUsage(db, employerId) {
  const { rows } = await db.query(
    `SELECT u.plan, (SELECT count(*)::int FROM ai_analyses WHERE employer_id = u.id AND created_at >= ${MONTH_PH}) AS used
     FROM users u WHERE u.id = $1`,
    [employerId]
  );
  const { plan, used } = rows[0];
  const limit = plan === 'free' ? (await getSettings()).free_ai_analyses : PLAN_LIMITS[plan].analyses;
  if (limit === null) return { plan, used, limit, remaining: used >= PREMIUM_FAIR_USE ? 0 : null };
  return { plan, used, limit, remaining: Math.max(0, limit - used) };
}
const outOfAnalyses = (res, usage) => res.status(402).json(usage.limit === null
  ? { error: `You've reached this month's fair-use limit of ${PREMIUM_FAIR_USE.toLocaleString('en-US')} Smart Scores. It resets on the 1st; email support@readytowork.ph if you need more sooner.`, usage }
  : { error: `You've used this month's ${usage.limit} Smart Scores on the ${PLAN_LIMITS[usage.plan].name} plan. They reset on the 1st.`, upgrade: true, usage });

app.get('/api/analyzer/usage', requireAuth('employer'), async (req, res) => {
  res.json(await analyzerUsage(pool, req.user.id));
});

// Scores one application against its job. Saved results are returned again for free; `again: true`
// asks the AI for a fresh look (e.g. after the job or the applicant's resume changed) and uses one more.
// 300 an hour leaves room for Premium's "score all applicants"; quotas are checked below.
app.post('/api/applications/:id/analyze', requireAuth('employer'), throttle(300, 60 * 60_000, 'an hour', perUser), async (req, res) => {
  const plan = await planOf(pool, req.user.id);
  const { rows: [row] } = await q(
    `SELECT a.id, a.cover_letter, a.analysis, ${RANK} AS rank, j.title, j.description, j.skills AS job_skills, j.job_type,
       p.title AS worker_title, p.bio, p.skills AS worker_skills, p.hourly_rate, p.availability,
       CASE WHEN a.resume_attached THEN coalesce(p.resume_text, '') END AS resume_text
     FROM applications a JOIN jobs j ON j.id = a.job_id LEFT JOIN worker_profiles p ON p.user_id = a.worker_id
     WHERE a.id = $1 AND j.employer_id = $2`,
    [num(req.params.id), req.user.id]
  );
  if (!row) return res.status(404).json({ error: 'Application not found' });
  if (PLAN_LIMITS[plan].applicants !== null && row.rank >= PLAN_LIMITS[plan].applicants) return hiddenApplicant(res, plan);
  const again = req.body?.again === true;
  if (row.analysis && !again) return res.json({ analysis: row.analysis, usage: await analyzerUsage(pool, req.user.id) });

  const before = await analyzerUsage(pool, req.user.id);
  if (before.remaining === 0) return outOfAnalyses(res, before);

  let analysis;
  try {
    const raw = await app.locals.analyzeApplication({
      job: { title: row.title, description: row.description, skills: row.job_skills, job_type: row.job_type },
      applicant: { title: row.worker_title, bio: row.bio, skills: row.worker_skills, hourly_rate: row.hourly_rate, availability: row.availability, cover_letter: row.cover_letter, resume_text: row.resume_text },
    });
    const list = (v) => (Array.isArray(v) ? v.map((x) => str(x, 200)).filter(Boolean).slice(0, 4) : []);
    analysis = {
      score: Math.max(0, Math.min(100, Math.round(Number(raw.score) || 0))),
      verdict: str(raw.verdict, 300),
      strengths: list(raw.strengths),
      concerns: list(raw.concerns),
      // so the employer knows when a scanned (image-only) resume couldn't be included
      resume: row.resume_text === null ? 'none' : row.resume_text ? 'read' : 'unreadable',
    };
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: 'The analyzer is unavailable right now. Please try again.' });
  }

  // Re-check the quota under a lock so parallel clicks can't go past the free limit.
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
    const usage = await analyzerUsage(db, req.user.id);
    if (usage.remaining === 0) {
      await db.query('ROLLBACK');
      return outOfAnalyses(res, usage);
    }
    // A first analysis only saves if no parallel click saved one already (that one wins, and only it counts).
    const { rows: [saved] } = await db.query(
      `UPDATE applications SET analysis = $2, analyzed_at = now() WHERE id = $1 ${again ? '' : 'AND analysis IS NULL'} RETURNING analysis`,
      [row.id, analysis]
    );
    if (saved) await db.query('INSERT INTO ai_analyses (employer_id, application_id) VALUES ($1, $2)', [req.user.id, row.id]);
    const result = saved?.analysis ?? (await db.query('SELECT analysis FROM applications WHERE id = $1', [row.id])).rows[0].analysis;
    await db.query('COMMIT');
    res.json({ analysis: result, usage: await analyzerUsage(pool, req.user.id) });
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
});

// --- Feedback ---
// Anyone can tell us what to improve, signed in or not. Each message is saved for the admin panel and
// emailed to support so nothing gets missed.
const FEEDBACK_TYPES = { idea: 'Idea', bug: 'Something broke', other: 'Other' };
const FEEDBACK_MAX = 2000;
app.post('/api/feedback', throttle(10, 60 * 60_000, 'an hour'), async (req, res) => {
  const type = req.body?.type;
  if (!(type in FEEDBACK_TYPES)) return bad(res, 'Choose Idea, Something broke or Other');
  if (typeof req.body.message === 'string' && req.body.message.trim().length > FEEDBACK_MAX)
    return bad(res, `Please keep it under ${FEEDBACK_MAX.toLocaleString('en-US')} characters`);
  const message = str(req.body.message, FEEDBACK_MAX);
  if (!message) return bad(res, 'Please write a message');
  const me = await signedInUser(req);
  if (!me && !(await verifyHuman(req))) return notHuman(res); // visitors only; signed-in people are known
  const email = me ? null : str(req.body.email, 200) || null;
  if (email && !EMAIL.test(email)) return bad(res, 'That email address doesn’t look right');
  EMAIL.lastIndex = 0; // EMAIL is a global regex; reset it after .test()
  const page = str(req.body.page, 300) || null;
  const contactOk = req.body.contact_ok === true;
  const { rows: [fb] } = await q(
    'INSERT INTO feedback (user_id, type, message, page, contact_ok, email) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [me?.id ?? null, type, message, page, contactOk, email]);
  const { rows: [u] } = me ? await q('SELECT name, email, role, plan FROM users WHERE id = $1', [me.id]) : { rows: [] };
  const from = u ? `${u.name} <${u.email}> (${u.role}${u.role === 'employer' ? `, ${u.plan}` : ''})` : email ? `Visitor <${email}>` : 'Anonymous visitor';
  app.locals.sendEmail({
    to: 'support@readytowork.ph',
    subject: `Feedback #${fb.id}: ${FEEDBACK_TYPES[type]}`,
    text: `${FEEDBACK_TYPES[type]} from ${from}\nPage: ${page ?? 'unknown'}\nOK to contact: ${contactOk ? 'yes' : 'no'}\n\n${message}\n\nSee all feedback: ${SITE}/admin`,
  }).catch((err) => console.error(err));
  res.status(201).json({ id: fb.id });
});

// Contact us: a support request from anyone. It lands in the admin inbox (type "support") and in the
// support mailbox, where Reply goes straight to the person who wrote.
app.post('/api/contact', throttle(5, 60 * 60_000, 'an hour'), async (req, res) => {
  const me = await signedInUser(req);
  const name = str(req.body?.name, 100);
  const email = str(req.body?.email, 200).toLowerCase();
  const subject = str(req.body?.subject, 150);
  const message = str(req.body?.message, 5000);
  if (!name) return bad(res, 'Please enter your name');
  const validEmail = EMAIL.test(email); EMAIL.lastIndex = 0; // EMAIL is a global regex; reset it after .test()
  if (!validEmail) return bad(res, 'Please enter a valid email address so we can reply');
  if (!subject) return bad(res, 'Please add a subject');
  if (message.length < 5) return bad(res, 'Please write a little more so we can help');
  if (!me && !(await verifyHuman(req))) return notHuman(res);
  const { rows: [fb] } = await q(
    `INSERT INTO feedback (user_id, type, message, page, contact_ok, email, sender_name, subject)
     VALUES ($1, 'support', $2, $3, true, $4, $5, $6) RETURNING id`,
    [me?.id ?? null, message, str(req.body.page, 300) || null, email, name, subject]);
  app.locals.sendEmail({
    to: 'support@readytowork.ph', replyTo: email,
    subject: `Support #${fb.id}: ${subject}`,
    text: `From: ${name} <${email}>${me ? ` (signed in as ${me.role} #${me.id})` : ' (not signed in)'}\n\n${message}\n\nReply to this email to answer them. All messages: ${SITE}/admin/feedback`,
  }).catch((err) => console.error(err));
  res.status(201).json({ id: fb.id });
});

app.get('/api/admin/feedback', requireAdmin, async (req, res) => {
  const { rows } = await q(
    `SELECT f.id, f.type, f.message, f.page, f.contact_ok, f.created_at, f.done_at, f.subject,
       coalesce(u.email, f.email) AS email, coalesce(u.name, f.sender_name) AS name, u.role
     FROM feedback f LEFT JOIN users u ON u.id = f.user_id
     ORDER BY f.done_at IS NOT NULL, f.created_at DESC LIMIT 200`);
  res.json(rows);
});

app.put('/api/admin/feedback/:id', requireAdmin, async (req, res) => {
  const { rowCount } = await q('UPDATE feedback SET done_at = CASE WHEN $2 THEN now() END WHERE id = $1', [num(req.params.id), req.body?.done === true]);
  rowCount ? res.status(204).end() : res.status(404).json({ error: 'Feedback not found' });
});

// --- Admin: users, jobs, subscriptions ---
const PAGE_SIZES = [10, 25, 50, 100];
const sizeOf = (req) => (PAGE_SIZES.includes(Number(req.query.per_page)) ? Number(req.query.per_page) : 25); // rows per page the admin picked
const like = (v) => `%${str(v, 100).replace(/[\\%_]/g, (c) => `\\${c}`)}%`; // a search term, with LIKE's wildcards taken literally
const pageOf = (req) => Math.max(0, Math.floor(num(req.query.page) ?? 0));

// Everyone, newest first; search by name or email, filter by role or plan.
// Suspend (or lift it): signs them out everywhere, hides them and their jobs, and blocks their email from
// signing up again. Lifting it removes the block; they can log in again.
app.put('/api/admin/users/:id/suspend', requireAdmin, async (req, res) => {
  const on = req.body?.suspended === true;
  const { rows: [u] } = await q(
    `UPDATE users SET suspended_at = CASE WHEN $2 THEN coalesce(suspended_at, now()) END,
       sessions_valid_from = CASE WHEN $2 THEN now() + interval '1 second' ELSE sessions_valid_from END
     WHERE id = $1 AND deleted_at IS NULL RETURNING email, suspended_at`, [num(req.params.id), on]);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (on) await q('INSERT INTO blocked_emails (email_hash) VALUES ($1) ON CONFLICT DO NOTHING', [hashToken(u.email)]);
  else await q('DELETE FROM blocked_emails WHERE email_hash = $1', [hashToken(u.email)]);
  res.json({ suspended_at: u.suspended_at });
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  const role = ['worker', 'employer'].includes(req.query.role) ? req.query.role : '';
  const plan = ['free', 'pro', 'premium'].includes(req.query.plan) ? req.query.plan : '';
  const { rows } = await q(
    `SELECT u.id, u.name, u.email, u.role, u.plan, u.created_at, u.last_seen_at, u.last_country, u.google_sub IS NOT NULL AS google, u.suspended_at,
       (SELECT count(*)::int FROM jobs j WHERE j.employer_id = u.id) AS jobs,
       (SELECT count(*)::int FROM applications a WHERE a.worker_id = u.id) AS applications,
       count(*) OVER ()::int AS total
     FROM users u
     WHERE u.deleted_at IS NULL AND ($1 = '%%' OR u.name ILIKE $1 OR u.email ILIKE $1) AND ($2 = '' OR u.role = $2) AND ($3 = '' OR (u.role = 'employer' AND u.plan = $3))
     ORDER BY u.created_at DESC LIMIT $5 OFFSET $4`,
    [like(req.query.q), role, plan, pageOf(req) * sizeOf(req), sizeOf(req)]);
  res.json({ users: rows.map(({ total: _, ...u }) => u), total: rows[0]?.total ?? 0, page_size: sizeOf(req) });
});

// Every job post, newest first; search by title or employer, filter open/closed.
app.get('/api/admin/jobs', requireAdmin, async (req, res) => {
  const status = ['open', 'closed'].includes(req.query.status) ? req.query.status : '';
  const { rows } = await q(
    `SELECT j.id, j.title, j.job_type, j.created_at, j.closed_at, u.id AS employer_id, u.name AS employer_name, u.email AS employer_email, u.plan,
       (SELECT count(*)::int FROM applications a WHERE a.job_id = j.id) AS applicants,
       count(*) OVER ()::int AS total
     FROM jobs j JOIN users u ON u.id = j.employer_id
     WHERE ($1 = '%%' OR j.title ILIKE $1 OR u.name ILIKE $1 OR u.email ILIKE $1)
       AND ($2 = '' OR ($2 = 'open' AND j.closed_at IS NULL) OR ($2 = 'closed' AND j.closed_at IS NOT NULL))
     ORDER BY j.created_at DESC LIMIT $4 OFFSET $3`,
    [like(req.query.q), status, pageOf(req) * sizeOf(req), sizeOf(req)]);
  res.json({ jobs: rows.map(({ total: _, ...j }) => j), total: rows[0]?.total ?? 0, page_size: sizeOf(req) });
});

// Close a post (spam, scams, a job the employer forgot) or reopen it. Closing hides it from search and stops applications.
app.put('/api/admin/jobs/:id/closed', requireAdmin, async (req, res) => {
  const { rowCount } = await q('UPDATE jobs SET closed_at = CASE WHEN $2 THEN coalesce(closed_at, now()) END WHERE id = $1', [num(req.params.id), req.body?.closed === true]);
  rowCount ? res.status(204).end() : res.status(404).json({ error: 'Job not found' });
});

// Who pays and how much: paid employers from our database, with price, billing period, renewal and status
// from Paddle. Plans switched on by hand (no Paddle subscription) show as "manual".
// ponytail: reads the first 200 live subscriptions from Paddle; page through meta.pagination when there are more.
app.get('/api/admin/subscriptions', requireAdmin, async (req, res) => {
  const { rows: paying } = await q(
    `SELECT id, name, email, plan, plan_changed_at, paddle_subscription_id FROM users
     WHERE role = 'employer' AND plan <> 'free' ORDER BY plan_changed_at DESC NULLS LAST`);
  const { rows: [{ employers }] } = await q("SELECT count(*)::int AS employers FROM users WHERE role = 'employer' AND deleted_at IS NULL");
  let live = new Map(), paddleError = null;
  if (process.env.PADDLE_API_KEY && paying.some((u) => u.paddle_subscription_id)) {
    try {
      const subs = await paddle('/subscriptions?status=active,past_due,paused&per_page=200');
      live = new Map(subs.map((s) => [s.id, s]));
    } catch (err) {
      console.error(err.message);
      paddleError = 'Couldn’t reach Paddle, so prices and renewals are missing.';
    }
  }
  const rows = paying.map((u) => {
    const s = live.get(u.paddle_subscription_id);
    const item = s?.items?.[0]?.price;
    const price = item ? Number(item.unit_price.amount) / 100 : null;
    const yearly = item?.billing_cycle?.interval === 'year';
    return {
      id: u.id, name: u.name, email: u.email, plan: u.plan, since: u.plan_changed_at,
      source: !u.paddle_subscription_id ? 'manual' : s ? 'paddle' : 'unknown',
      status: s?.status ?? null, price, yearly, monthly: price === null ? null : yearly ? Math.round((price / 12) * 100) / 100 : price,
      next_billed_at: s?.next_billed_at ?? null,
      cancels_at: s?.scheduled_change?.action === 'cancel' ? s.scheduled_change.effective_at : null,
    };
  });
  const sum = (f) => Math.round(rows.filter(f).reduce((n, r) => n + (r.monthly ?? 0), 0) * 100) / 100;
  res.json({
    totals: {
      monthly_revenue: sum((r) => r.status === 'active' || r.status === 'past_due'),
      paying: rows.length, pro: rows.filter((r) => r.plan === 'pro').length, premium: rows.filter((r) => r.plan === 'premium').length,
      cancelling: rows.filter((r) => r.cancels_at).length, past_due: rows.filter((r) => r.status === 'past_due').length,
      manual: rows.filter((r) => r.source === 'manual').length, employers,
    },
    subscriptions: rows, paddle_error: paddleError,
  });
});

// --- Find matches: the AI recruiting agent (matchAgent.js) ---
// Pro gets 3 runs a month, Premium 30. A run holds its request open while it streams steps (Cloud Run only
// gives CPU during a request), so runs are capped per server to leave room for everyone else's pages.
app.locals.matchModel = callClaude; // swappable so tests run the agent with a scripted fake model
const MATCH_STALE = "interval '3 minutes'"; // a run still 'running' after this was interrupted
const MAX_LIVE_RUNS = 20;
let liveRuns = 0;

// Runs this calendar month (Philippine time). Interrupted and failed runs don't count.
async function matchUsage(db, employerId) {
  const { rows: [r] } = await db.query(
    `SELECT u.plan, (SELECT count(*)::int FROM match_runs WHERE employer_id = u.id AND created_at >= ${MONTH_PH}
       AND (status = 'done' OR (status = 'running' AND created_at > now() - ${MATCH_STALE}))) AS used
     FROM users u WHERE u.id = $1`, [employerId]);
  const limit = PLAN_LIMITS[r.plan].matches;
  return { plan: r.plan, used: r.used, limit, remaining: Math.max(0, limit - r.used) };
}
const stopStaleRuns = () => q(`UPDATE match_runs SET status = 'failed', error = 'Interrupted before it finished', finished_at = now()
  WHERE status = 'running' AND created_at < now() - ${MATCH_STALE}`);
const ownJob = async (employerId, jobId) => (await q(
  'SELECT id, title, description, skills, job_type, salary_min, salary_max, salary_period FROM jobs WHERE id = $1 AND employer_id = $2',
  [jobId, employerId])).rows[0];
const payText = (j) => (j.salary_min == null && j.salary_max == null ? ''
  : `$${[j.salary_min, j.salary_max].filter((v) => v != null).map(Number).join('-')} ${j.salary_period === 'fixed' ? 'fixed price' : `per ${j.salary_period}`}`);

// The agent's tools, scoped to one employer: the same search and privacy rules as Hire Talent ("Maria S.",
// no links, contact details hidden, unless that employer may contact the worker), in a compact form.
const daysAgo = (t) => (t ? Math.floor((Date.now() - new Date(t).getTime()) / 86_400_000) : null);
const agentCard = (w) => ({
  id: w.id, name: w.name, title: w.title, skills: w.skills, hourly_rate: w.hourly_rate, availability: w.availability,
  hours_per_week: w.hours_per_week, work_hours: w.work_hours, last_active_days_ago: daysAgo(w.last_seen_at),
});
function matchTools(employerId) {
  return {
    // Unlike the Hire Talent box (one phrase), the agent's search words each count: a worker matching any of
    // them is found, and people matching more of them come first, like a recruiter typing keywords.
    async search({ query, skills, max_rate, availability }) {
      const params = [];
      const { where, add } = workerFilters({ skills, rate_max: max_rate, availability }, params);
      const words = [...new Set(String(query ?? '').toLowerCase().split(/[\s,;/]+/).filter((w) => w.length > 1))].slice(0, 6);
      const hits = words.map((w) => {
        const t = add(like(w));
        return `(p.title ILIKE ${t} OR p.bio ILIKE ${t} OR EXISTS (SELECT 1 FROM unnest(p.skills) s WHERE s ILIKE ${t}))`;
      });
      if (hits.length) where.push(`(${hits.join(' OR ')})`);
      const score = hits.length ? `(${hits.map((h) => `${h}::int`).join(' + ')}) DESC, ` : '';
      const { rows } = await q(`${WORKER_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${score}${WORKER_SORTS.active} LIMIT 15`, params);
      const view = await workerViews(employerId, rows.map((w) => w.id));
      return rows.map((w) => agentCard(view(w)));
    },
    async profile(id) {
      const { rows: [w] } = await q(`${WORKER_SELECT} WHERE u.id = $1 AND p.title <> '' AND u.deactivated_at IS NULL AND u.suspended_at IS NULL`, [id]);
      if (!w) return null;
      const full = (await revealFor(employerId, [id]))(id);
      const v = (await workerViews(employerId, [id]))(w);
      // The CV text, when the worker shares their CV and this employer may download it (the same rule as the CV button).
      const cv = full && w.has_resume
        ? (await q('SELECT resume_text FROM worker_profiles WHERE user_id = $1', [id])).rows[0]?.resume_text : null;
      return {
        ...agentCard(v), bio: str(v.bio, 1500), skill_years: v.skill_years, location: v.location, start_when: v.start_when,
        english: v.english, languages: v.languages,
        cv: cv ? str(cv, 4000) : w.has_resume ? 'Shared, but the employer can’t see it on their plan.' : 'No CV shared.',
      };
    },
  };
}

// A saved run with its shortlist shown live: today's names and details under today's privacy rules. People who
// deleted or had their account suspended drop off; paused ones and people already hired are marked.
// The job's hourly budget ceiling, when the job is paid by the hour (for the "above your budget" note).
const hourlyCap = (job) => (job.salary_period === 'hour' && job.salary_max != null ? Number(job.salary_max) : null);
async function matchRunView(employerId, run, job) {
  if (!run) return null;
  const cap = hourlyCap(job);
  const ids = (run.shortlist ?? []).map((m) => m.worker_id);
  const { rows } = ids.length ? await q(`${WORKER_SELECT} WHERE u.id = ANY($1) AND u.suspended_at IS NULL`, [ids]) : { rows: [] };
  const view = await workerViews(employerId, ids);
  const workers = new Map(rows.map((w) => [w.id, view(w)]));
  const { rows: hires } = await q('SELECT worker_id FROM hires WHERE employer_id = $1 AND worker_id = ANY($2)', [employerId, ids]);
  const hired = new Set(hires.map((h) => h.worker_id));
  return {
    id: run.id, status: run.status, summary: run.summary, error: run.error, steps: run.steps,
    created_at: run.created_at, finished_at: run.finished_at,
    matches: (run.shortlist ?? []).filter((m) => workers.has(m.worker_id)).map((m) => {
      const w = workers.get(m.worker_id);
      return {
        score: m.score, reason: hideContacts(m.reason), hired: hired.has(w.id),
        over_budget: cap !== null && w.hourly_rate != null && Number(w.hourly_rate) > cap,
        worker: { id: w.id, name: w.name, title: w.title, skills: w.skills, hourly_rate: w.hourly_rate, availability: w.availability, last_seen_at: w.last_seen_at, deactivated: w.deactivated, limited: !!w.limited },
      };
    }),
  };
}

// A job's latest finished run (or ?run=<id>), its past runs, and this month's allowance.
app.get('/api/jobs/:id/matches', requireAuth('employer'), async (req, res) => {
  const job = await ownJob(req.user.id, num(req.params.id));
  if (!job) return res.status(404).json({ error: 'Job not found' });
  await stopStaleRuns();
  const { rows: runs } = await q(
    `SELECT id, status, jsonb_array_length(coalesce(shortlist, '[]')) AS count, created_at FROM match_runs
     WHERE job_id = $1 ORDER BY created_at DESC LIMIT 20`, [job.id]);
  const pick = req.query.run ? runs.find((r) => r.id === num(req.query.run)) : runs.find((r) => r.status === 'done');
  const { rows: [run] } = pick ? await q('SELECT * FROM match_runs WHERE id = $1', [pick.id]) : { rows: [] };
  res.json({ runs, run: await matchRunView(req.user.id, run, job), budget: payText(job), usage: await matchUsage(pool, req.user.id) });
});

// Starts a run and streams what the agent does (Server-Sent Events); every step is saved as it happens.
app.post('/api/jobs/:id/matches', requireAuth('employer'), throttle(20, 60 * 60_000, 'an hour', perUser), async (req, res) => {
  const job = await ownJob(req.user.id, num(req.params.id));
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (liveRuns >= MAX_LIVE_RUNS) return res.status(503).json({ error: 'Smart Matching is busy right now. Please try again in a minute.' });
  await stopStaleRuns();

  // Check the allowance and that no other run is going, under a lock so two clicks can't both start one.
  const db = await pool.connect();
  let run;
  try {
    await db.query('BEGIN');
    await db.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
    const usage = await matchUsage(db, req.user.id);
    const refuse = (status, body) => db.query('ROLLBACK').then(() => res.status(status).json(body));
    if (usage.remaining === 0) {
      return await refuse(402, usage.limit === 0
        ? { error: 'Smart Matching is part of the Pro and Premium plans.', upgrade: true, usage }
        : { error: `You've used this month's ${usage.limit} Smart Matching searches on the ${PLAN_LIMITS[usage.plan].name} plan. They reset on the 1st.`, upgrade: usage.plan !== 'premium', usage });
    }
    if ((await db.query("SELECT 1 FROM match_runs WHERE employer_id = $1 AND status = 'running'", [req.user.id])).rowCount)
      return await refuse(409, { error: 'A match search is already running. It takes about a minute.' });
    ({ rows: [run] } = await db.query('INSERT INTO match_runs (job_id, employer_id) VALUES ($1, $2) RETURNING id', [job.id, req.user.id]));
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    db.release();
  }

  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' });
  const send = (event) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`); };
  send({ type: 'start', run_id: run.id });
  const steps = [];
  liveRuns++;
  try {
    const result = await runMatchAgent({
      job: { ...job, pay: payText(job) },
      tools: matchTools(req.user.id),
      model: app.locals.matchModel,
      onStep: (step) => {
        const saved = { ...step, at: new Date().toISOString() };
        steps.push(saved);
        send(saved);
        q('UPDATE match_runs SET steps = $2 WHERE id = $1', [run.id, JSON.stringify(steps)]).catch((err) => console.error(err));
      },
    });
    const { rows: [done] } = await q(
      `UPDATE match_runs SET status = 'done', steps = $2, shortlist = $3, summary = $4, input_tokens = $5, output_tokens = $6, finished_at = now()
       WHERE id = $1 RETURNING *`,
      [run.id, JSON.stringify(steps), JSON.stringify(result.shortlist), result.summary, result.usage.input_tokens, result.usage.output_tokens]);
    send({ type: 'result', run: await matchRunView(req.user.id, done, job), budget: payText(job), usage: await matchUsage(pool, req.user.id) });
  } catch (err) {
    console.error(err);
    await q("UPDATE match_runs SET status = 'failed', steps = $2, error = $3, finished_at = now() WHERE id = $1",
      [run.id, JSON.stringify(steps), 'Smart Matching ran into a problem']).catch((e) => console.error(e));
    send({ type: 'error', error: 'Smart Matching ran into a problem, and this search wasn’t counted. Please try again.' });
  } finally {
    liveRuns--;
    res.end();
  }
});

// --- Hiring analytics (Premium) ---
// One employer's hiring at a glance, for the last 7, 30 or 90 days and for all jobs or one job:
// headline numbers against the period before, applications over time (Philippine days or weeks),
// the funnel from applied to replied, the fit-score mix, the best candidates not yet messaged, and
// every job's numbers. Premium sees everyone who applied, so these count every application.
const RANGES = [7, 30, 90];
app.get('/api/analytics', requireAuth('employer'), async (req, res) => {
  if ((await planOf(pool, req.user.id)) !== 'premium')
    return res.status(402).json({ error: 'Hiring analytics is part of the Premium plan', upgrade: true });
  const days = RANGES.includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const jobId = req.query.job ? num(req.query.job) : null;
  if (jobId !== null) {
    const { rowCount } = await q('SELECT 1 FROM jobs WHERE id = $1 AND employer_id = $2', [jobId, req.user.id]);
    if (!rowCount) return res.status(404).json({ error: 'Job not found' });
  }
  const now = Date.now();
  const since = new Date(now - days * 864e5), before = new Date(now - 2 * days * 864e5);
  const mineAt = (n) => `j.employer_id = $1 AND ($${n}::int IS NULL OR j.id = $${n})`; // $n is the job filter
  const mine = mineAt(4);
  const messaged = 'EXISTS (SELECT 1 FROM messages m WHERE m.sender_id = $1 AND m.recipient_id = a.worker_id)';
  const replied = 'EXISTS (SELECT 1 FROM messages m WHERE m.sender_id = a.worker_id AND m.recipient_id = $1)';
  const score = "(a.analysis->>'score')::int";
  const cur = 'a.created_at >= $2', prev = 'a.created_at >= $3 AND a.created_at < $2';
  const p = [req.user.id, since, before, jobId];
  const unit = days <= 30 ? 'day' : 'week';
  const buckets = unit === 'day' ? days : 13;

  const [{ rows: [t] }, { rows: [first] }, { rows: chart }, { rows: candidates }, { rows: jobs }] = await Promise.all([
    q(`SELECT
         (count(*) FILTER (WHERE ${cur}))::int AS applicants, (count(*) FILTER (WHERE ${prev}))::int AS applicants_prev,
         round(avg(${score}) FILTER (WHERE ${cur}))::int AS avg_score, round(avg(${score}) FILTER (WHERE ${prev}))::int AS avg_score_prev,
         (count(*) FILTER (WHERE ${cur} AND a.analysis IS NOT NULL))::int AS scored,
         (count(*) FILTER (WHERE ${cur} AND ${messaged}))::int AS messaged, (count(*) FILTER (WHERE ${prev} AND ${messaged}))::int AS messaged_prev,
         (count(*) FILTER (WHERE ${cur} AND ${messaged} AND ${replied}))::int AS replied, (count(*) FILTER (WHERE ${prev} AND ${messaged} AND ${replied}))::int AS replied_prev,
         (count(*) FILTER (WHERE ${cur} AND ${score} >= 85))::int AS strong,
         (count(*) FILTER (WHERE ${cur} AND ${score} BETWEEN 65 AND 84))::int AS good,
         (count(*) FILTER (WHERE ${cur} AND ${score} BETWEEN 40 AND 64))::int AS partial,
         (count(*) FILTER (WHERE ${cur} AND ${score} < 40))::int AS poor
       FROM applications a JOIN jobs j ON j.id = a.job_id WHERE ${mine}`, p),
    // median hours from posting a job to its first application
    q(`SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY h))::int AS hours FROM (
         SELECT extract(epoch FROM min(a.created_at) - j.created_at) / 3600 AS h
         FROM jobs j JOIN applications a ON a.job_id = j.id WHERE ${mineAt(2)} GROUP BY j.id) x`, [req.user.id, jobId]),
    q(`SELECT to_char(b, 'YYYY-MM-DD') AS start, count(a.id)::int AS applicants
       FROM generate_series(date_trunc($3, now() AT TIME ZONE 'Asia/Manila') - ($4::int - 1) * ('1 ' || $3)::interval,
                            date_trunc($3, now() AT TIME ZONE 'Asia/Manila'), ('1 ' || $3)::interval) b
       LEFT JOIN (applications a JOIN jobs j ON j.id = a.job_id AND ${mineAt(2)})
         ON date_trunc($3, a.created_at AT TIME ZONE 'Asia/Manila') = b
       GROUP BY b ORDER BY b`, [req.user.id, jobId, unit, buckets]),
    // open jobs only: people you could still hire
    q(`SELECT a.id, a.job_id, a.worker_id, u.name, j.title, ${score} AS score, a.credits
       FROM applications a JOIN jobs j ON j.id = a.job_id JOIN users u ON u.id = a.worker_id
       WHERE ${mineAt(2)} AND j.closed_at IS NULL AND a.analysis IS NOT NULL AND NOT ${messaged}
       ORDER BY score DESC, a.credits DESC, a.created_at LIMIT 5`, [req.user.id, jobId]),
    // every job (it's also the job picker), its numbers for the period, and a 12-week trend
    q(`SELECT j.id, j.title, j.created_at, j.closed_at,
         (count(a.id) FILTER (WHERE ${cur}))::int AS applicants,
         (count(a.id) FILTER (WHERE a.created_at > now() - interval '7 days'))::int AS new_7d,
         (count(a.analysis) FILTER (WHERE ${cur}))::int AS scored,
         round(avg(${score}) FILTER (WHERE ${cur}))::int AS avg_score,
         max(${score}) FILTER (WHERE ${cur}) AS top_score,
         (count(DISTINCT a.worker_id) FILTER (WHERE ${cur} AND ${messaged}))::int AS messaged,
         round(extract(epoch FROM min(a.created_at) - j.created_at) / 3600)::int AS hours_to_first,
         (SELECT array_agg(n ORDER BY w) FROM (
            SELECT w, count(b.id)::int AS n
            FROM generate_series(date_trunc('week', now() AT TIME ZONE 'Asia/Manila') - interval '11 weeks',
                                 date_trunc('week', now() AT TIME ZONE 'Asia/Manila'), interval '1 week') w
            LEFT JOIN applications b ON b.job_id = j.id AND date_trunc('week', b.created_at AT TIME ZONE 'Asia/Manila') = w
            GROUP BY w) s) AS trend
       FROM jobs j LEFT JOIN applications a ON a.job_id = j.id
       WHERE j.employer_id = $1 GROUP BY j.id ORDER BY j.closed_at IS NOT NULL, j.created_at DESC`, [req.user.id, since]),
  ]);
  const { strong, good, partial, poor, ...tiles } = t;
  res.json({
    days, job: jobId, unit, chart,
    tiles: { ...tiles, first_applicant_hours: first?.hours ?? null },
    funnel: { applied: t.applicants, scored: t.scored, messaged: t.messaged, replied: t.replied },
    mix: { strong, good, partial, poor },
    candidates, jobs,
  });
});

// --- Messages ---

// Inbox: one row per person you've exchanged messages with, newest first.
// Which of this employer's jobs a worker applied to, newest first, within what their plan lets them see.
// Shown in Messages so the employer knows what each conversation is about.
async function appliedToMe(employerId, workerIds) {
  const limit = PLAN_LIMITS[await planOf(pool, employerId)].applicants;
  const { rows } = await q(
    `SELECT a.worker_id, a.id AS application_id, a.job_id, j.title, a.created_at, a.credits, (a.analysis->>'score')::int AS score, a.created_at > now() - interval '3 days' AS recent,
       EXISTS (SELECT 1 FROM hires h WHERE h.employer_id = $2 AND h.worker_id = a.worker_id AND h.job_id = a.job_id) AS hired,
       EXISTS (SELECT 1 FROM messages m WHERE m.sender_id = $2 AND m.recipient_id = a.worker_id AND m.job_id = a.job_id) AS messaged
     FROM applications a JOIN jobs j ON j.id = a.job_id
     WHERE a.worker_id = ANY($1) AND j.employer_id = $2 AND ($3::int IS NULL OR ${RANK} < $3)
     ORDER BY a.created_at DESC`, [workerIds, employerId, limit]);
  const by = {};
  for (const { worker_id, ...r } of rows) (by[worker_id] ??= []).push(r);
  return by;
}

app.get('/api/messages', requireAuth(), async (req, res) => {
  const { rows } = await q(
    `WITH m AS (
       SELECT CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS other, sender_id, body, created_at
       FROM messages WHERE sender_id = $1 OR recipient_id = $1
     ), latest AS (SELECT DISTINCT ON (other) * FROM m ORDER BY other, created_at DESC)
     SELECT l.other AS user_id, u.name, u.role, u.deleted_at IS NOT NULL AS deleted, u.deactivated_at IS NOT NULL AS deactivated, l.body AS last_body, l.created_at AS last_at, l.sender_id = $1 AS last_from_me,
       (SELECT count(*)::int FROM messages x WHERE x.sender_id = l.other AND x.recipient_id = $1 AND x.read_at IS NULL) AS unread
     FROM latest l JOIN users u ON u.id = l.other ORDER BY l.created_at DESC`,
    [req.user.id]
  );
  if (req.user.role === 'employer') {
    const applied = await appliedToMe(req.user.id, rows.map((r) => r.user_id));
    for (const r of rows) r.applied = applied[r.user_id] ?? [];
  }
  res.json(rows);
});

app.get('/api/messages/unread-count', requireAuth(), async (req, res) => {
  const { rows } = await q('SELECT count(*)::int AS count FROM messages WHERE recipient_id = $1 AND read_at IS NULL', [req.user.id]);
  res.json(rows[0]);
});

// The other person, if messaging them is allowed at all (employer <-> worker only).
async function counterpart(me, otherId) {
  const { rows } = await q(
    `SELECT id, name, email, role, CASE WHEN deleted_at IS NOT NULL THEN 'deleted' WHEN suspended_at IS NOT NULL THEN 'suspended' WHEN deactivated_at IS NOT NULL THEN 'deactivated' END AS status
     FROM users WHERE id = $1`, [num(otherId)]);
  const other = rows[0];
  return other && other.id !== me.id && other.role !== me.role ? other : null;
}

// Workers may only reply to employers who messaged them first. Employers on a paid plan can reach out to
// any worker; on Free, only to workers who applied to one of their jobs, or to keep a conversation going.
async function canSend(me, other) {
  if (me.role === 'employer') {
    if (PLAN_LIMITS[await planOf(pool, me.id)].outreach) return true;
    const { rowCount } = await q(
      `SELECT 1 FROM applications a JOIN jobs j ON j.id = a.job_id WHERE j.employer_id = $1 AND a.worker_id = $2
       UNION ALL
       SELECT 1 FROM messages WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)
       LIMIT 1`,
      [me.id, other.id]
    );
    return rowCount > 0;
  }
  const { rowCount } = await q('SELECT 1 FROM messages WHERE sender_id = $1 AND recipient_id = $2 LIMIT 1', [other.id, me.id]);
  return rowCount > 0;
}

// Opening a conversation marks the other person's messages as read.
app.get('/api/messages/:userId', requireAuth(), async (req, res) => {
  const other = await counterpart(req.user, req.params.userId);
  if (!other) return res.status(404).json({ error: 'Conversation not found' });
  await q('UPDATE messages SET read_at = now() WHERE sender_id = $1 AND recipient_id = $2 AND read_at IS NULL', [other.id, req.user.id]);
  const { rows } = await q(
    `SELECT m.id, m.sender_id, m.body, m.created_at, m.read_at, m.job_id, j.title AS job_title
     FROM messages m LEFT JOIN jobs j ON j.id = m.job_id
     WHERE (m.sender_id = $1 AND m.recipient_id = $2) OR (m.sender_id = $2 AND m.recipient_id = $1)
     ORDER BY m.created_at, m.id`,
    [req.user.id, other.id]
  );
  // Employers see the worker's side panel: their headline, rate and every application to this employer.
  const employerView = req.user.role === 'employer' && other.role === 'worker';
  const applied = employerView ? (await appliedToMe(req.user.id, [other.id]))[other.id] ?? [] : undefined;
  const profile = employerView ? (await q('SELECT title, hourly_rate FROM worker_profiles WHERE user_id = $1', [other.id])).rows[0] ?? {} : {};
  res.json({ user: { id: other.id, name: other.name, role: other.role, status: other.status, ...profile }, can_send: !other.status && await canSend(req.user, other), messages: rows, applied });
});

// Message many applicants at once (the Applicants page): each gets the same text in their own private
// conversation, tagged with the job they applied to. Only applicants the employer's plan lets them see.
const BULK_MAX = 50;
app.post('/api/messages/bulk', requireAuth('employer'), throttle(10, 60 * 60_000, 'an hour', perUser), async (req, res) => {
  const body = str(req.body?.body, 5000);
  const ids = [...new Set((Array.isArray(req.body?.application_ids) ? req.body.application_ids : []).map(num).filter(Number.isInteger))];
  if (!body) return bad(res, 'Message can’t be empty');
  if (!ids.length) return bad(res, 'Pick at least one applicant');
  if (ids.length > BULK_MAX) return bad(res, `You can message up to ${BULK_MAX} applicants at once`);
  const limit = PLAN_LIMITS[await planOf(pool, req.user.id)].applicants;
  const { rows } = await q(
    `SELECT DISTINCT ON (a.worker_id) a.worker_id, a.job_id, j.title AS job_title, u.name, u.email,
       CASE WHEN u.deleted_at IS NOT NULL THEN 'deleted' WHEN u.suspended_at IS NOT NULL THEN 'suspended' WHEN u.deactivated_at IS NOT NULL THEN 'deactivated' END AS status
     FROM applications a JOIN jobs j ON j.id = a.job_id JOIN users u ON u.id = a.worker_id
     WHERE a.id = ANY($1) AND j.employer_id = $2 AND ($3::int IS NULL OR ${RANK} < $3)
     ORDER BY a.worker_id, a.created_at DESC`, [ids, req.user.id, limit]);
  const sent = [], skipped = [];
  for (const r of rows) {
    if (r.status) { skipped.push({ name: r.status === 'deleted' ? 'Deleted user' : r.name, reason: r.status === 'deactivated' ? 'paused their account' : 'can’t get messages' }); continue; }
    await deliverMessage(req.user, { id: r.worker_id, name: r.name, email: r.email }, { id: r.job_id, title: r.job_title }, body);
    sent.push(r.worker_id);
  }
  res.status(201).json({ sent: sent.length, skipped });
});

// Saves one message and emails the recipient, but only for their first unread message from this sender,
// so a burst of messages sends one email. `job` ({ id, title }) tags the conversation, or null.
async function deliverMessage(me, other, job, body) {
  // Email only for the first unread message, so a burst of messages sends one email.
  const { rowCount: alreadyUnread } = await q(
    'SELECT 1 FROM messages WHERE sender_id = $1 AND recipient_id = $2 AND read_at IS NULL LIMIT 1',
    [me.id, other.id]
  );
  const { rows } = await q(
    `INSERT INTO messages (sender_id, recipient_id, job_id, body) VALUES ($1, $2, $3, $4)
     RETURNING id, sender_id, body, created_at, read_at, job_id`,
    [me.id, other.id, job?.id ?? null, body]
  );
  if (!alreadyUnread) {
    const { rows: [sender] } = await q('SELECT name FROM users WHERE id = $1', [me.id]);
    const preview = body.length > 400 ? `${body.slice(0, 400)}…` : body;
    app.locals.sendEmail({
      to: other.email,
      subject: `New message from ${sender.name} on ReadyToWork.ph`,
      ...renderEmail({
        preheader: preview.slice(0, 120),
        greeting: `Hi ${other.name},`,
        intro: [`${sender.name} sent you a message on ReadyToWork.ph${job ? ` about "${job.title}"` : ''}:`],
        quote: preview,
        button: { label: 'Read and reply', url: `${SITE}/messages?with=${me.id}` },
        reason: 'You’re receiving this because someone messaged you on ReadyToWork.ph. We email you once, then wait until you’ve read your messages.',
      }),
    }).catch((err) => console.error(err));
  }
  return rows[0];
}

app.post('/api/messages/:userId', requireAuth(), throttle(60, 60 * 60_000, 'an hour', perUser), async (req, res) => {
  const other = await counterpart(req.user, req.params.userId);
  if (!other || other.status === 'deleted') return res.status(404).json({ error: 'You can only message employers or workers on ReadyToWork.ph' });
  if (other.status) return res.status(403).json({ error: other.status === 'suspended' ? 'This account has been suspended.' : `${other.name} has paused their account, so they can’t get new messages right now.` });
  const body = str(req.body.body, 5000);
  if (!body) return bad(res, 'Message can’t be empty');
  if (!(await canSend(req.user, other))) return res.status(403).json(req.user.role === 'employer'
    ? { error: 'On the Free plan you can message workers who applied to your jobs. Upgrade to Pro to reach out to any worker first.', upgrade: true }
    : { error: 'You can reply once this employer messages you' });

  let job = null;
  if (req.body.job_id != null) {
    const employerId = req.user.role === 'employer' ? req.user.id : other.id;
    ({ rows: [job] } = await q('SELECT id, title FROM jobs WHERE id = $1 AND employer_id = $2', [num(req.body.job_id), employerId]));
    if (!job) return bad(res, 'That job isn’t part of this conversation');
  }

  const row = await deliverMessage(req.user, other, job, body);
  res.status(201).json({ ...row, job_title: job?.title ?? null });
});

// --- Resumes (optional, PDF, private) ---
app.locals.storage = storage; // swappable so tests don't touch real R2
const MAX_RESUME_MB = 5;
const uploads = throttle(20, 60 * 60_000, 'an hour', perUser); // resume + photo uploads (reading PDFs is heavy)

app.get('/api/profile/resume', requireAuth('worker'), async (req, res) => {
  const { rows: [p] } = await q('SELECT resume_key, resume_name, resume_uploaded_at FROM worker_profiles WHERE user_id = $1', [req.user.id]);
  if (!p?.resume_key) return res.json({ resume: null });
  res.json({ resume: { name: p.resume_name, uploaded_at: p.resume_uploaded_at, url: await app.locals.storage.signedUrl(p.resume_key, p.resume_name) } });
});

// Pulls the text out of a PDF once, at upload, so the analyzer can read it without re-downloading the file.
// Returns '' for scanned (image-only) or broken PDFs. Capped at roughly 4 pages of text.
export async function pdfText(buffer) {
  try {
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(buffer)), { mergePages: true });
    return text.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim().slice(0, 12000);
  } catch {
    return '';
  }
}

// Each worker keeps one resume file; a replaced or removed file is deleted from storage.
const deleteFile = (key) => key && app.locals.storage.remove(key).catch((err) => console.error(err));

// The browser sends the PDF as the raw request body, with its file name in the X-File-Name header.
app.put('/api/profile/resume', requireAuth('worker'), uploads,
  express.raw({ type: 'application/pdf', limit: `${MAX_RESUME_MB}mb` }),
  async (req, res) => {
    const file = req.body;
    if (!Buffer.isBuffer(file) || !file.length) return bad(res, 'Choose a PDF file to upload');
    if (file.subarray(0, 5).toString('latin1') !== '%PDF-') return bad(res, 'Your resume must be a PDF file');
    let name = 'resume.pdf';
    try { name = decodeURIComponent(req.get('x-file-name') ?? '') || name; } catch { /* keep default */ }
    name = name.replace(/[^\w .()-]/g, '_').slice(0, 120);
    if (!name.toLowerCase().endsWith('.pdf')) name += '.pdf';

    const key = `resumes/${req.user.id}/${randomUUID()}.pdf`;
    const [text] = await Promise.all([pdfText(file), app.locals.storage.put(key, file, 'application/pdf')]);
    const { rows: [old] } = await q('SELECT resume_key FROM worker_profiles WHERE user_id = $1', [req.user.id]);
    const { rows: [p] } = await q(
      `UPDATE worker_profiles SET resume_key = $2, resume_name = $3, resume_uploaded_at = now(), resume_text = $4 WHERE user_id = $1
       RETURNING resume_name, resume_uploaded_at`,
      [req.user.id, key, name, text]
    );
    await deleteFile(old?.resume_key);
    res.json({ resume: { name: p.resume_name, uploaded_at: p.resume_uploaded_at, url: await app.locals.storage.signedUrl(key, name) } });
  });

app.delete('/api/profile/resume', requireAuth('worker'), async (req, res) => {
  const { rows: [old] } = await q('SELECT resume_key FROM worker_profiles WHERE user_id = $1', [req.user.id]);
  await q('UPDATE worker_profiles SET resume_key = NULL, resume_name = NULL, resume_uploaded_at = NULL, resume_text = NULL WHERE user_id = $1', [req.user.id]);
  await deleteFile(old?.resume_key);
  res.status(204).end();
});

// --- Profile photos (private R2; viewers are redirected to a short-lived signed link) ---
const MAX_PHOTO_MB = 1; // the browser crops and shrinks photos to ~400px before upload, so real ones are far smaller
// Checks the file's first bytes, so a renamed file of another type is rejected.
const imageType = (b) =>
  b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? 'image/jpeg'
  : b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? 'image/png'
  : b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' ? 'image/webp'
  : null;
// Shown when a user has no photo, so <img> tags never error and the initials underneath show through.
const BLANK_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

app.get('/api/users/:id/photo', async (req, res) => {
  const { rows: [u] } = await q('SELECT photo_key FROM users WHERE id = $1', [num(req.params.id)]);
  res.set('Cache-Control', 'public, max-age=60');
  if (!u?.photo_key) return res.type('image/gif').send(BLANK_GIF);
  res.redirect(302, await app.locals.storage.signedUrl(u.photo_key, 'photo', 600));
});

app.put('/api/profile/photo', requireAuth(), uploads,
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: `${MAX_PHOTO_MB}mb` }),
  async (req, res) => {
    const file = req.body;
    const type = Buffer.isBuffer(file) && file.length >= 12 ? imageType(file) : null;
    if (!type) return bad(res, 'Your photo must be a JPEG, PNG or WebP image');
    const key = `photos/${req.user.id}/${randomUUID()}.${type.split('/')[1]}`;
    await app.locals.storage.put(key, file, type);
    const { rows: [old] } = await q('SELECT photo_key FROM users WHERE id = $1', [req.user.id]);
    await q('UPDATE users SET photo_key = $2 WHERE id = $1', [req.user.id, key]);
    await deleteFile(old?.photo_key);
    res.json({ ok: true });
  });

app.delete('/api/profile/photo', requireAuth(), async (req, res) => {
  const { rows: [old] } = await q('SELECT photo_key FROM users WHERE id = $1', [req.user.id]);
  await q('UPDATE users SET photo_key = NULL WHERE id = $1', [req.user.id]);
  await deleteFile(old?.photo_key);
  res.status(204).end();
});

// Only the employer who received the application can open the (current) resume attached to it.
app.get('/api/applications/:id/resume', requireAuth('employer'), async (req, res) => {
  const plan = await planOf(pool, req.user.id);
  const { rows: [a] } = await q(
    `SELECT p.resume_key, p.resume_name, ${RANK} AS rank FROM applications a JOIN jobs j ON j.id = a.job_id
     JOIN worker_profiles p ON p.user_id = a.worker_id
     WHERE a.id = $1 AND j.employer_id = $2 AND a.resume_attached`,
    [num(req.params.id), req.user.id]
  );
  if (a && PLAN_LIMITS[plan].applicants !== null && a.rank >= PLAN_LIMITS[plan].applicants) return hiddenApplicant(res, plan);
  if (!a?.resume_key) return res.status(404).json({ error: 'No resume attached' });
  res.json({ url: await app.locals.storage.signedUrl(a.resume_key, a.resume_name) });
});

// --- Billing (Paddle) ---
// Paddle is the seller: employers pay at Paddle's checkout, Paddle handles sales tax and pays us out.
// Plans are only switched by what Paddle reports about a subscription (its webhook, or its answer when
// we change a plan), never by the browser.
const PADDLE_API = process.env.PADDLE_ENV === 'production' ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com';
const PRICES = () => ({
  pro: { monthly: process.env.PADDLE_PRICE_PRO_MONTHLY, yearly: process.env.PADDLE_PRICE_PRO_YEARLY },
  premium: { monthly: process.env.PADDLE_PRICE_PREMIUM_MONTHLY, yearly: process.env.PADDLE_PRICE_PREMIUM_YEARLY },
});
const planOfPrice = (id) => Object.entries(PRICES()).find(([, p]) => id && (p.monthly === id || p.yearly === id))?.[0];
const isYearly = (id) => Object.values(PRICES()).some((p) => p.yearly === id);

async function paddle(path, body, method = body ? 'POST' : 'GET') {
  const res = await fetch(PADDLE_API + path, {
    method,
    headers: { authorization: `Bearer ${process.env.PADDLE_API_KEY}`, 'content-type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(`Paddle ${method} ${path} answered ${res.status}: ${JSON.stringify(json?.error)}`), { paddle: json?.error });
  return json.data;
}

const LIVE = ['active', 'trialing', 'past_due'];
// Saves what Paddle says about a subscription. The paid plan stays on while it's active or Paddle is
// retrying a payment, and goes back to Free once it's canceled or paused. Only the account's current
// subscription changes its plan (a new paid one takes over), and Paddle's messages can arrive out of
// order, so an older state never overwrites a newer one. Returns false for a price we don't sell.
async function saveSubscription(sub, userId) {
  const plan = LIVE.includes(sub.status) ? planOfPrice(sub.items?.[0]?.price?.id) : 'free';
  if (!plan) return false;
  await q(
    `UPDATE users SET plan = $1, paddle_customer_id = $2, paddle_subscription_id = $3, paddle_updated_at = $4
     WHERE role = 'employer' AND (paddle_subscription_id = $3 OR (id = $5 AND (paddle_subscription_id IS NULL OR $6)))
       AND (paddle_updated_at IS NULL OR paddle_updated_at < $4::timestamptz)`,
    [plan, sub.customer_id, sub.id, sub.updated_at, Number(userId) || 0, plan !== 'free']
  );
  return true;
}
const billingAccount = async (userId) =>
  (await q('SELECT email, plan, paddle_customer_id, paddle_subscription_id FROM users WHERE id = $1', [userId])).rows[0];
const portalUrl = async (u) =>
  (await paddle(`/customers/${u.paddle_customer_id}/portal-sessions`, { subscription_ids: [u.paddle_subscription_id] })).urls.general.overview;

// What the pricing page needs to open Paddle's checkout. No token yet: the page says "email us to upgrade".
app.get('/api/billing/config', (req, res) => {
  const ready = process.env.PADDLE_CLIENT_TOKEN && process.env.PADDLE_API_KEY;
  res.json({ token: ready ? process.env.PADDLE_CLIENT_TOKEN : null, environment: process.env.PADDLE_ENV === 'production' ? 'production' : 'sandbox' });
});

// Starts a checkout. The transaction is made here, not in the browser, so the page can't change which
// account it upgrades. Employers already paying switch plans with /api/billing/change instead (a second
// checkout would bill them twice).
app.post('/api/billing/checkout', requireAuth('employer'), async (req, res) => {
  const price = PRICES()[req.body?.plan]?.[req.body?.yearly ? 'yearly' : 'monthly'];
  if (!price) return bad(res, 'Choose Pro or Premium');
  const u = await billingAccount(req.user.id);
  // Testing sandbox payments on the live site: Paddle's public test card would hand anyone a free paid plan,
  // so only the emails in PADDLE_TESTERS may check out. Unset it (with live keys) to open checkout to everyone.
  const testers = (process.env.PADDLE_TESTERS ?? '').toLowerCase().split(',').map((e) => e.trim()).filter(Boolean);
  if (testers.length && !testers.includes(u.email.toLowerCase()))
    return res.status(403).json({ error: 'Online checkout is coming soon. Contact us at support@readytowork.ph to upgrade.' });
  if (u.plan !== 'free' && u.paddle_subscription_id) return res.status(409).json({ error: 'You already have a paid plan. Switch plans from the pricing page.' });
  const txn = await paddle('/transactions', {
    items: [{ price_id: price, quantity: 1 }],
    custom_data: { user_id: String(req.user.id) },
    ...(u.paddle_customer_id && { customer_id: u.paddle_customer_id }),
  });
  res.json({ transaction_id: txn.id, email: u.paddle_customer_id ? null : u.email });
});

// The employer's subscription as Paddle has it now, for the pricing page: plan, monthly or yearly, next
// renewal, and whether it's set to cancel.
app.get('/api/billing/subscription', requireAuth('employer'), async (req, res) => {
  const u = await billingAccount(req.user.id);
  if (!u.paddle_subscription_id || u.plan === 'free') return res.json({ subscription: null });
  const sub = await paddle(`/subscriptions/${u.paddle_subscription_id}`);
  // A missed webhook would leave the account on a plan Paddle already ended; catch up from what Paddle says now.
  if (!LIVE.includes(sub.status)) { await saveSubscription(sub, req.user.id); return res.json({ subscription: null }); }
  const price = sub.items?.[0]?.price?.id;
  res.json({ subscription: {
    plan: planOfPrice(price), yearly: isYearly(price), status: sub.status, next_billed_at: sub.next_billed_at,
    cancels_at: sub.scheduled_change?.action === 'cancel' ? sub.scheduled_change.effective_at : null,
  } });
});

// Paddle's billing page: card on file, invoices, cancelling.
app.post('/api/billing/portal', requireAuth('employer'), async (req, res) => {
  const u = await billingAccount(req.user.id);
  if (!u.paddle_subscription_id) return res.status(404).json({ error: 'No billing account yet' });
  res.json({ url: await portalUrl(u) });
});

// Switches a paying employer's plan (Pro <-> Premium, monthly <-> yearly) on their existing subscription.
// Without `confirm` it only previews what Paddle would charge today; with it, Paddle charges the card on
// file at once, crediting the unused part of the old plan, and the new plan applies right away.
app.post('/api/billing/change', requireAuth('employer'), async (req, res) => {
  const price = PRICES()[req.body?.plan]?.[req.body?.yearly ? 'yearly' : 'monthly'];
  if (!price) return bad(res, 'Choose Pro or Premium');
  const u = await billingAccount(req.user.id);
  if (u.plan === 'free' || !u.paddle_subscription_id) return res.status(409).json({ error: 'Subscribe first, then you can switch plans' });
  const change = { items: [{ price_id: price, quantity: 1 }], proration_billing_mode: 'prorated_immediately' };
  try {
    if (!req.body.confirm) {
      const p = await paddle(`/subscriptions/${u.paddle_subscription_id}/preview`, change, 'PATCH');
      const usd = (t) => (t ? Number(t.details.totals.grand_total) / 100 : 0); // prices are in USD
      // On a downgrade nothing is charged; the unused part of the old plan becomes credit toward the next bills.
      const credit = p.update_summary?.result?.action === 'credit' ? Number(p.update_summary.result.amount) / 100 : 0;
      return res.json({ preview: { today: usd(p.immediate_transaction), credit, next_billed_at: p.next_billed_at } });
    }
    const sub = await paddle(`/subscriptions/${u.paddle_subscription_id}`, change, 'PATCH');
    await saveSubscription(sub, req.user.id); // Paddle's webhook says the same a moment later
    res.json({ plan: planOfPrice(price) });
  } catch (err) {
    if (!err.paddle) throw err;
    console.error(err.message);
    res.status(400).json({ error: err.paddle.code === 'subscription_locked_pending_changes'
      ? 'Your plan has a change waiting to apply (such as a cancellation). Undo it from Manage billing, then switch.'
      : err.paddle.code === 'forbidden' // our API key lacks Subscriptions: Write
        ? 'Switching plans isn’t available right now. Please email support@readytowork.ph and we’ll switch it for you.'
        : `Paddle couldn’t switch your plan: ${err.paddle.detail ?? 'please try again'}` });
  }
});

// Paddle-Signature is "ts=<unix time>;h1=<hmac>" (more than one h1 while Paddle rotates secrets).
function paddleSigned(req) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  const fields = (req.get('paddle-signature') ?? '').split(';').map((p) => p.split('='));
  const ts = fields.find(([k]) => k === 'ts')?.[1];
  if (!secret || !req.rawBody || !(Math.abs(Date.now() / 1000 - Number(ts)) <= 300)) return false; // 5 min for clock drift
  const expected = createHmac('sha256', secret).update(`${ts}:`).update(req.rawBody).digest('hex');
  return fields.some(([k, v]) => k === 'h1' && sameText(v, expected));
}

// Every subscription change (new, renewed, switched, payment failing, canceled) arrives here. Canceling
// takes effect at the end of the paid period, so employers keep what they paid for.
app.post('/api/billing/webhook', async (req, res) => {
  if (!paddleSigned(req)) return res.status(401).json({ error: 'Bad signature' });
  const { event_type, data: sub } = req.body;
  if (!event_type?.startsWith('subscription.')) return res.status(204).end();
  // Subscriptions that aren't one of our accounts' (like the samples Paddle's Simulations send) are ignored.
  const { rowCount: ours } = await q(
    "SELECT 1 FROM users WHERE role = 'employer' AND (paddle_subscription_id = $1 OR id = $2)", [sub.id, Number(sub.custom_data?.user_id) || 0]);
  if (!ours) return res.status(204).end();
  // A price we don't know means the PADDLE_PRICE_* settings are wrong. Failing makes Paddle retry,
  // so the upgrade still lands once they're fixed.
  if (!(await saveSubscription(sub, sub.custom_data?.user_id))) {
    console.error(`Paddle webhook: unknown price ${sub.items?.[0]?.price?.id}`);
    return res.status(500).json({ error: 'Unknown price' });
  }
  res.status(204).end();
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large')
    return res.status(413).json({ error: req.path.endsWith('/resume') ? `Your resume is too large (max ${MAX_RESUME_MB} MB)`
      : req.path.endsWith('/photo') ? `Your photo is too large (max ${MAX_PHOTO_MB} MB)` : 'Request is too large' });
  if (err.status >= 400 && err.status < 500) return res.status(err.status).json({ error: 'Bad request' }); // e.g. broken JSON
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});
