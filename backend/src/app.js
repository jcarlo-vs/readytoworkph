import express from 'express';
import cors from 'cors';
import { OAuth2Client } from 'google-auth-library';
import { pool, q } from './db.js';
import { hashPassword, verifyPassword, signToken, requireAuth, signAdminToken, requireAdmin } from './auth.js';
import { sendEmail, renderEmail } from './email.js';
import { analyzeApplication } from './analyzer.js';
import { extractText, getDocumentProxy } from 'unpdf';
import { storage } from './storage.js';
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';

const TYPES = ['full-time', 'part-time', 'gig'];
const PAGE_SIZE = 20;
const PERIODS = ['hour', 'month', 'year', 'fixed'];
const PRO_ANALYSES = 500; // ponytail: counts all-time like the free limit; make both monthly when billing lands
export const DAILY_CREDITS = 60;

// Site settings the admin can change at /admin, stored in the settings table (defaults apply until changed).
const SETTINGS = {
  topups_enabled: { default: false, valid: (v) => typeof v === 'boolean' },
  daily_applications: { default: 60, valid: (v) => Number.isInteger(v) && v >= 1 && v <= 500 }, // spam cap; 0-credit applies are free
  free_ai_analyses: { default: 10, valid: (v) => Number.isInteger(v) && v >= 0 && v <= 1000 },
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
    .map((s) => String(s).trim().toLowerCase()).filter(Boolean))].slice(0, 30);
const bad = (res, error) => res.status(400).json({ error });

export const app = express();
app.set('trust proxy', 1); // behind Cloud Run's load balancer: req.ip is the real visitor
app.locals.sendEmail = sendEmail; // swappable so tests can capture emails
// FRONTEND_ORIGIN can list several sites, comma-separated (e.g. the live domain and a test address).
// Browsers may call the API from any of them; links in emails use the first one.
const SITES = (process.env.FRONTEND_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const SITE = SITES[0];
app.use(cors({ origin: SITES }));
app.use(express.json({ limit: '100kb' }));

// Welcome email for every new account (email or Google sign-up); sending happens in the background.
function welcome({ email, name, role }) {
  const site = SITE;
  const worker = role === 'worker';
  const email_ = renderEmail(worker ? {
    preheader: 'Your worker account is ready. Here’s how to land your first remote job.',
    greeting: `Hi ${name},`,
    intro: ['Welcome to RemotePinas! Your worker account is ready. Here’s how to get hired:'],
    steps: [
      ['Complete your profile', 'Add a professional title, your skills and your rate so employers can find you. A resume helps too.'],
      ['Browse remote jobs', 'Full-time, part-time and gig work from employers around the world.'],
      ['Apply with Credits', 'You get 60 free Credits every day. They’re optional: put more on the jobs you want most and employers see you first.'],
    ],
    button: { label: 'Complete your profile', url: `${site}/profile` },
    reason: 'You’re receiving this because you created a worker account on RemotePinas.',
  } : {
    preheader: 'Your employer account is ready. Here’s how to make your first hire.',
    greeting: `Hi ${name},`,
    intro: ['Welcome to RemotePinas! Your employer account is ready. Here’s how to find your next great hire:'],
    steps: [
      ['Post your first job', 'Describe the role, the skills you need and your budget. Posting is free.'],
      ['Review applicants', 'Applicants are sorted by interest, and the AI score shows how well each one fits.'],
      ['Message and hire directly', 'Talk to candidates, agree on pay together, and pay them directly. No markups.'],
    ],
    button: { label: 'Post your first job', url: `${site}/jobs/new` },
    reason: 'You’re receiving this because you created an employer account on RemotePinas.',
  });
  app.locals.sendEmail({
    to: email,
    subject: worker ? 'Welcome to RemotePinas: let’s get you hired' : 'Welcome to RemotePinas: start hiring Filipino talent',
    ...email_,
  }).catch((err) => console.error(err));
}

// ponytail: in-memory attempt counters per key, reset on restart and kept per server copy; move to a
// shared store (e.g. Postgres or Redis) if abuse ever gets past it.
function limiter(max, windowMs, strict = false) {
  const hits = new Map();
  const recent = (key) => (hits.get(key) ?? []).filter((t) => Date.now() - t < windowMs);
  return {
    blocked: (key) => (strict || !app.locals.relaxedLimits) && recent(key).length >= max,
    hit: (key) => hits.set(key, [...recent(key), Date.now()]),
    clear: (key) => hits.delete(key),
  };
}
const loginFails = limiter(10, 15 * 60_000); // wrong passwords per visitor
const signups = limiter(10, 60 * 60_000); // new accounts per visitor
const tooMany = (res, wait) => res.status(429).json({ error: `Too many attempts. Please try again in ${wait}.` });

// --- Auth ---
app.post('/api/auth/register', async (req, res) => {
  if (signups.blocked(req.ip)) return tooMany(res, 'an hour');
  const email = str(req.body.email, 200).toLowerCase();
  const name = str(req.body.name, 100);
  const { password, role } = req.body;
  if (!/^\S+@\S+\.\S+$/.test(email)) return bad(res, 'Valid email required');
  if (!name) return bad(res, 'Name required');
  if (typeof password !== 'string' || password.length < 8) return bad(res, 'Password must be at least 8 characters');
  if (!['worker', 'employer'].includes(role)) return bad(res, 'Role must be worker or employer');

  const { rows } = await q(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO NOTHING RETURNING id, email, name, role, plan, photo_key IS NOT NULL AS has_photo`,
    [email, await hashPassword(password), name, role]
  );
  if (!rows[0]) return res.status(409).json({ error: 'Email already registered' });
  signups.hit(req.ip);
  if (role === 'worker') await q('INSERT INTO worker_profiles (user_id) VALUES ($1)', [rows[0].id]);
  welcome(rows[0]);
  res.status(201).json({ token: signToken(rows[0]), user: rows[0] });
});

app.post('/api/auth/login', async (req, res) => {
  if (loginFails.blocked(req.ip)) return tooMany(res, '15 minutes');
  const { rows } = await q('SELECT * FROM users WHERE email = $1', [str(req.body.email, 200).toLowerCase()]);
  const user = rows[0];
  if (!user?.password_hash || !(await verifyPassword(String(req.body.password ?? ''), user.password_hash))) {
    loginFails.hit(req.ip);
    return res.status(401).json({ error: user && !user.password_hash ? 'This account uses Google sign-in' : 'Wrong email or password' });
  }
  loginFails.clear(req.ip);
  const { id, email, name, role, plan } = user;
  res.json({ token: signToken(user), user: { id, email, name, role, plan, has_photo: !!user.photo_key } });
});

// Swappable so tests can fake Google; real tokens are checked against GOOGLE_CLIENT_ID.
const googleClient = new OAuth2Client();
app.locals.verifyGoogle = async (idToken) =>
  (await googleClient.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID })).getPayload();

app.post('/api/auth/google', async (req, res) => {
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
  let { rows } = await q('SELECT id, email, name, role, plan, photo_key IS NOT NULL AS has_photo FROM users WHERE google_sub = $1', [g.sub]);
  if (!rows[0]) ({ rows } = await q(
    'UPDATE users SET google_sub = $1 WHERE email = $2 AND google_sub IS NULL RETURNING id, email, name, role, plan, photo_key IS NOT NULL AS has_photo',
    [g.sub, email]
  ));
  if (rows[0]) return res.json({ token: signToken(rows[0]), user: rows[0] });

  const { role } = req.body;
  if (!['worker', 'employer'].includes(role))
    return res.status(404).json({ error: 'No account yet. Choose how you’ll use RemotePinas to sign up.', needsRole: true });
  ({ rows } = await q(
    `INSERT INTO users (email, name, role, google_sub) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role, plan, photo_key IS NOT NULL AS has_photo`,
    [email, str(g.name, 100) || email.split('@')[0], role, g.sub]
  ));
  if (role === 'worker') await q('INSERT INTO worker_profiles (user_id) VALUES ($1)', [rows[0].id]);
  welcome(rows[0]);
  res.status(201).json({ token: signToken(rows[0]), user: rows[0] });
});

app.get('/api/me', requireAuth(), async (req, res) => {
  const { rows } = await q('SELECT id, email, name, role, plan, photo_key IS NOT NULL AS has_photo FROM users WHERE id = $1', [req.user.id]);
  rows[0] ? res.json(rows[0]) : res.status(404).json({ error: 'User not found' });
});

app.get('/api/stats', async (req, res) => {
  const { rows } = await q(`SELECT
    (SELECT count(*)::int FROM jobs) AS jobs,
    (SELECT count(*)::int FROM worker_profiles WHERE title <> '') AS workers,
    (SELECT count(*)::int FROM users WHERE role = 'employer') AS employers,
    (SELECT count(*)::int FROM users WHERE role = 'employer' AND plan <> 'free'
       AND plan_changed_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila') AS upgraded_this_month`);
  res.json(rows[0]);
});

// --- Jobs ---
app.get('/api/jobs', async (req, res) => {
  const where = ['j.closed_at IS NULL'];
  const params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replaceAll('?', `$${params.length}`)); };
  if (req.query.q) add('(j.title ILIKE ? OR j.description ILIKE ?)', `%${str(req.query.q, 100)}%`);
  if (req.query.skill) add('? = ANY(j.skills)', str(req.query.skill, 50).toLowerCase());
  if (TYPES.includes(req.query.type)) add('j.job_type = ?', req.query.type);
  const page = Math.max(1, parseInt(req.query.page) || 1);

  const { rows } = await q(
    `SELECT j.*, u.name AS employer_name FROM jobs j JOIN users u ON u.id = j.employer_id
     WHERE ${where.join(' AND ')}
     ORDER BY j.created_at DESC LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
    params
  );
  res.json(rows);
});

app.get('/api/jobs/:id', async (req, res) => {
  const { rows } = await q(
    `SELECT j.*, u.name AS employer_name FROM jobs j JOIN users u ON u.id = j.employer_id WHERE j.id = $1`,
    [num(req.params.id)]
  );
  rows[0] ? res.json(rows[0]) : res.status(404).json({ error: 'Job not found' });
});

// Validates a job post (create or edit). Returns { error } or the cleaned fields in column order.
function jobFields(body) {
  const title = str(body.title, 200);
  const description = str(body.description);
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
  return { values: [title, description, skillList(body.skills), job_type, salary_min, salary_max, salary_period] };
}

app.post('/api/jobs', requireAuth('employer'), async (req, res) => {
  const { error, values } = jobFields(req.body);
  if (error) return bad(res, error);
  const { rows } = await q(
    `INSERT INTO jobs (employer_id, title, description, skills, job_type, salary_min, salary_max, salary_period)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [req.user.id, ...values]
  );
  res.status(201).json(rows[0]);
});

app.put('/api/jobs/:id', requireAuth('employer'), async (req, res) => {
  const { error, values } = jobFields(req.body);
  if (error) return bad(res, error);
  const { rows } = await q(
    `UPDATE jobs SET title = $3, description = $4, skills = $5, job_type = $6, salary_min = $7, salary_max = $8, salary_period = $9, updated_at = now()
     WHERE id = $1 AND employer_id = $2 RETURNING *`,
    [num(req.params.id), req.user.id, ...values]
  );
  rows[0] ? res.json(rows[0]) : res.status(404).json({ error: 'Job not found' });
});

// Closing stops new applications and hides the job from search; applicants and messages stay.
app.put('/api/jobs/:id/closed', requireAuth('employer'), async (req, res) => {
  if (typeof req.body.closed !== 'boolean') return bad(res, 'closed must be true or false');
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
  const { topups_enabled } = await getSettings();
  res.json({ topups_enabled });
});

const adminFails = limiter(5, 15 * 60_000, true); // always strict, even in tests
const sameText = (a, b) => timingSafeEqual(createHash('sha256').update(String(a)).digest(), createHash('sha256').update(String(b)).digest());

app.post('/api/admin/login', async (req, res) => {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return res.status(503).json({ error: 'Admin login is not set up' });
  if (adminFails.blocked(req.ip)) return tooMany(res, '15 minutes');
  const ok = sameText(str(req.body.email).toLowerCase(), ADMIN_EMAIL.toLowerCase()) & sameText(req.body.password ?? '', ADMIN_PASSWORD);
  if (!ok) {
    adminFails.hit(req.ip);
    return res.status(401).json({ error: 'Wrong email or password' });
  }
  adminFails.clear(req.ip);
  res.json({ token: signAdminToken() });
});

app.get('/api/admin/settings', requireAdmin, async (req, res) => res.json(await getSettings()));

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

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    // Lock this worker's row so parallel applies can't overspend today's credits.
    await db.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
    const { rows: [target] } = await db.query('SELECT closed_at FROM jobs WHERE id = $1', [num(req.params.id)]);
    if (target?.closed_at) {
      await db.query('ROLLBACK');
      return res.status(409).json({ error: 'This job is closed and no longer accepting applications' });
    }
    const dup = await db.query('SELECT 1 FROM applications WHERE job_id = $1 AND worker_id = $2', [num(req.params.id), req.user.id]);
    if (dup.rowCount) {
      await db.query('ROLLBACK');
      return res.status(409).json({ error: 'You already applied' });
    }
    const { remaining, applications } = await creditsToday(db, req.user.id);
    const { daily_applications } = await getSettings();
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

app.get('/api/jobs/:id/applications', requireAuth('employer'), async (req, res) => {
  const { rows } = await q(
    `SELECT a.id, a.cover_letter, a.credits, a.analysis, a.analyzed_at, CASE WHEN a.resume_attached THEN p.resume_name END AS resume_name, a.created_at, u.id AS worker_id, u.name, u.email, p.title, p.skills
     FROM applications a JOIN jobs j ON j.id = a.job_id
     JOIN users u ON u.id = a.worker_id LEFT JOIN worker_profiles p ON p.user_id = u.id
     WHERE a.job_id = $1 AND j.employer_id = $2 ORDER BY a.credits DESC, a.created_at ASC`,
    [num(req.params.id), req.user.id]
  );
  res.json(rows);
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
          JOIN users u ON u.id = t.worker_id) AS top_applicants
     FROM jobs j WHERE employer_id = $1 ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
});

app.get('/api/my/applications', requireAuth('worker'), async (req, res) => {
  const { rows } = await q(
    `SELECT a.id, a.credits, a.created_at, j.id AS job_id, j.title, u.name AS employer_name
     FROM applications a JOIN jobs j ON j.id = a.job_id JOIN users u ON u.id = j.employer_id
     WHERE a.worker_id = $1 ORDER BY a.created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
});

// --- Workers ---
const WORKER_SELECT = `SELECT u.id, u.name, p.title, p.bio, p.skills, p.hourly_rate, p.availability, p.portfolio_url, p.linkedin_url, p.updated_at
  FROM users u JOIN worker_profiles p ON p.user_id = u.id`;

// Talent isn't public: only signed-in employers can browse workers (workers can load their own profile).
app.get('/api/workers', requireAuth('employer'), async (req, res) => {
  const params = [];
  const where = ["p.title <> ''"];
  if (req.query.q) { params.push(`%${str(req.query.q, 100)}%`); where.push(`(p.title ILIKE $${params.length} OR p.bio ILIKE $${params.length})`); }
  if (req.query.skill) { params.push(str(req.query.skill, 50).toLowerCase()); where.push(`$${params.length} = ANY(p.skills)`); }
  const { rows } = await q(`${WORKER_SELECT} WHERE ${where.join(' AND ')} ORDER BY p.updated_at DESC LIMIT ${PAGE_SIZE}`, params);
  res.json(rows);
});

app.get('/api/workers/:id', requireAuth(), async (req, res) => {
  if (req.user.role !== 'employer' && req.user.id !== num(req.params.id)) return res.status(403).json({ error: 'Only employers can view worker profiles' });
  const { rows } = await q(`${WORKER_SELECT} WHERE u.id = $1`, [num(req.params.id)]);
  rows[0] ? res.json(rows[0]) : res.status(404).json({ error: 'Worker not found' });
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
  const { rows } = await q(
    `UPDATE worker_profiles SET title = $2, bio = $3, skills = $4, hourly_rate = $5, availability = $6,
       portfolio_url = $7, linkedin_url = $8, updated_at = now()
     WHERE user_id = $1 RETURNING *`,
    [req.user.id, str(req.body.title, 200), str(req.body.bio), skillList(req.body.skills), num(req.body.hourly_rate), availability, portfolio, linkedin]
  );
  res.json(rows[0]);
});

// --- AI application analyzer (employers) ---
app.locals.analyzeApplication = analyzeApplication; // swappable so tests don't call the real AI

async function analyzerUsage(db, employerId) {
  const { rows } = await db.query(
    `SELECT u.plan, (SELECT count(*)::int FROM applications a JOIN jobs j ON j.id = a.job_id
       WHERE j.employer_id = u.id AND a.analysis IS NOT NULL) AS used
     FROM users u WHERE u.id = $1`,
    [employerId]
  );
  const { plan, used } = rows[0];
  const { free_ai_analyses } = await getSettings();
  const limit = plan === 'pro' ? PRO_ANALYSES : free_ai_analyses;
  return { plan, used, limit, remaining: plan === 'premium' ? null : Math.max(0, limit - used) };
}

app.get('/api/analyzer/usage', requireAuth('employer'), async (req, res) => {
  res.json(await analyzerUsage(pool, req.user.id));
});

// Scores one application against its job. Saved results are returned again for free.
app.post('/api/applications/:id/analyze', requireAuth('employer'), async (req, res) => {
  const { rows: [row] } = await q(
    `SELECT a.id, a.cover_letter, a.analysis, j.title, j.description, j.skills AS job_skills, j.job_type,
       p.title AS worker_title, p.bio, p.skills AS worker_skills, p.hourly_rate, p.availability,
       CASE WHEN a.resume_attached THEN coalesce(p.resume_text, '') END AS resume_text
     FROM applications a JOIN jobs j ON j.id = a.job_id LEFT JOIN worker_profiles p ON p.user_id = a.worker_id
     WHERE a.id = $1 AND j.employer_id = $2`,
    [num(req.params.id), req.user.id]
  );
  if (!row) return res.status(404).json({ error: 'Application not found' });
  if (row.analysis) return res.json({ analysis: row.analysis, usage: await analyzerUsage(pool, req.user.id) });

  const before = await analyzerUsage(pool, req.user.id);
  if (before.remaining === 0) return res.status(402).json({ error: 'You’ve used all your free analyses', upgrade: true, usage: before });

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
      return res.status(402).json({ error: 'You’ve used all your free analyses', upgrade: true, usage });
    }
    const { rows } = await db.query(
      `UPDATE applications SET analysis = COALESCE(analysis, $2), analyzed_at = COALESCE(analyzed_at, now())
       WHERE id = $1 RETURNING analysis`,
      [row.id, analysis]
    );
    await db.query('COMMIT');
    res.json({ analysis: rows[0].analysis, usage: await analyzerUsage(pool, req.user.id) });
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
});

// --- Messages ---

// Inbox: one row per person you've exchanged messages with, newest first.
app.get('/api/messages', requireAuth(), async (req, res) => {
  const { rows } = await q(
    `WITH m AS (
       SELECT CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS other, sender_id, body, created_at
       FROM messages WHERE sender_id = $1 OR recipient_id = $1
     ), latest AS (SELECT DISTINCT ON (other) * FROM m ORDER BY other, created_at DESC)
     SELECT l.other AS user_id, u.name, u.role, l.body AS last_body, l.created_at AS last_at, l.sender_id = $1 AS last_from_me,
       (SELECT count(*)::int FROM messages x WHERE x.sender_id = l.other AND x.recipient_id = $1 AND x.read_at IS NULL) AS unread
     FROM latest l JOIN users u ON u.id = l.other ORDER BY l.created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
});

app.get('/api/messages/unread-count', requireAuth(), async (req, res) => {
  const { rows } = await q('SELECT count(*)::int AS count FROM messages WHERE recipient_id = $1 AND read_at IS NULL', [req.user.id]);
  res.json(rows[0]);
});

// The other person, if messaging them is allowed at all (employer <-> worker only).
async function counterpart(me, otherId) {
  const { rows } = await q('SELECT id, name, email, role FROM users WHERE id = $1', [num(otherId)]);
  const other = rows[0];
  return other && other.id !== me.id && other.role !== me.role ? other : null;
}

// Workers may only reply to employers who messaged them first.
async function canSend(me, other) {
  if (me.role === 'employer') return true;
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
  res.json({ user: { id: other.id, name: other.name, role: other.role }, can_send: await canSend(req.user, other), messages: rows });
});

app.post('/api/messages/:userId', requireAuth(), async (req, res) => {
  const other = await counterpart(req.user, req.params.userId);
  if (!other) return res.status(404).json({ error: 'You can only message employers or workers on RemotePinas' });
  const body = str(req.body.body, 5000);
  if (!body) return bad(res, 'Message can’t be empty');
  if (!(await canSend(req.user, other))) return res.status(403).json({ error: 'You can reply once this employer messages you' });

  let job = null;
  if (req.body.job_id != null) {
    const employerId = req.user.role === 'employer' ? req.user.id : other.id;
    ({ rows: [job] } = await q('SELECT id, title FROM jobs WHERE id = $1 AND employer_id = $2', [num(req.body.job_id), employerId]));
    if (!job) return bad(res, 'That job isn’t part of this conversation');
  }

  // Email only for the first unread message, so a burst of messages sends one email.
  const { rowCount: alreadyUnread } = await q(
    'SELECT 1 FROM messages WHERE sender_id = $1 AND recipient_id = $2 AND read_at IS NULL LIMIT 1',
    [req.user.id, other.id]
  );
  const { rows } = await q(
    `INSERT INTO messages (sender_id, recipient_id, job_id, body) VALUES ($1, $2, $3, $4)
     RETURNING id, sender_id, body, created_at, read_at, job_id`,
    [req.user.id, other.id, job?.id ?? null, body]
  );
  if (!alreadyUnread) {
    const { rows: [me] } = await q('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const preview = body.length > 400 ? `${body.slice(0, 400)}…` : body;
    app.locals.sendEmail({
      to: other.email,
      subject: `New message from ${me.name} on RemotePinas`,
      ...renderEmail({
        preheader: preview.slice(0, 120),
        greeting: `Hi ${other.name},`,
        intro: [`${me.name} sent you a message on RemotePinas${job ? ` about "${job.title}"` : ''}:`],
        quote: preview,
        button: { label: 'Read and reply', url: `${SITE}/messages?with=${req.user.id}` },
        reason: 'You’re receiving this because someone messaged you on RemotePinas. We email you once, then wait until you’ve read your messages.',
      }),
    }).catch((err) => console.error(err));
  }
  res.status(201).json({ ...rows[0], job_title: job?.title ?? null });
});

// --- Resumes (optional, PDF, private) ---
app.locals.storage = storage; // swappable so tests don't touch real R2
const MAX_RESUME_MB = 5;

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
app.put('/api/profile/resume', requireAuth('worker'),
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

app.put('/api/profile/photo', requireAuth(),
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
  const { rows: [a] } = await q(
    `SELECT p.resume_key, p.resume_name FROM applications a JOIN jobs j ON j.id = a.job_id
     JOIN worker_profiles p ON p.user_id = a.worker_id
     WHERE a.id = $1 AND j.employer_id = $2 AND a.resume_attached`,
    [num(req.params.id), req.user.id]
  );
  if (!a?.resume_key) return res.status(404).json({ error: 'No resume attached' });
  res.json({ url: await app.locals.storage.signedUrl(a.resume_key, a.resume_name) });
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large')
    return res.status(413).json({ error: req.path.endsWith('/resume') ? `Your resume is too large (max ${MAX_RESUME_MB} MB)`
      : req.path.endsWith('/photo') ? `Your photo is too large (max ${MAX_PHOTO_MB} MB)` : 'Request is too large' });
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});
