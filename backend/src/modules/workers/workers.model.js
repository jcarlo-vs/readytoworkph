// Worker profile queries: Hire Talent search, saved workers, hires, the worker's own profile.
import { PAGE_SIZE, TYPES } from '../../config.js';
import { pool } from '../../db/index.js';
import { searchWords } from '../../lib/search.js';
import { num, skillList } from '../../lib/validate.js';

// A worker profile as employers see it (before any limits for their plan, see workerViews).
export const WORKER_SELECT = `SELECT u.id, u.name, p.title, p.bio, p.skills, p.hourly_rate, p.availability, p.portfolio_url, p.linkedin_url, p.updated_at,
    p.skill_years, p.location, p.work_hours, p.hours_per_week, p.start_when, p.english, p.languages, p.internet_mbps, p.setup, p.show_resume,
    to_char(p.birth_date, 'YYYY-MM-DD') AS birth_date, date_part('year', age(p.birth_date))::int AS age, p.gender,
    (p.resume_key IS NOT NULL AND p.show_resume) AS has_resume, u.created_at AS member_since, u.last_seen_at,
    u.deactivated_at IS NOT NULL AS deactivated, u.email_verified_at IS NOT NULL AS email_verified, u.photo_key IS NOT NULL AS has_photo,
    (coalesce(p.portfolio_url, '') <> '' OR coalesce(p.linkedin_url, '') <> '') AS has_links -- trust checks; the links stay hidden from limited views
  FROM users u JOIN worker_profiles p ON p.user_id = u.id`;

// Talent isn't public: only signed-in employers can browse workers (workers can load their own profile).
// Search title, bio and skills; filter by skills (all of them), availability, hourly rate and how recently
// they were active; sort; 20 per page. Names aren't searchable, so a hidden surname can't be confirmed.
export const WORKER_SORTS = {
  active: 'u.last_seen_at DESC NULLS LAST, p.updated_at DESC',
  rate: 'p.hourly_rate ASC NULLS LAST, u.last_seen_at DESC NULLS LAST',
  newest: 'u.created_at DESC',
};


// Hire Talent's filters, shared by the page and the AI matcher. Adds its values to `params`.
export function workerFilters(query, params) {
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

// One page of Hire Talent results for this employer, with `saved`; and how many match in all.
export async function search(employerId, query, page) {
  const params = [employerId];
  const { where, match, add } = workerFilters(query, params);
  const sort = WORKER_SORTS[query.sort] ?? WORKER_SORTS.active;
  const { rows } = await pool.query(
    `${WORKER_SELECT.replace(' FROM users u', `, EXISTS (SELECT 1 FROM saved_workers s WHERE s.employer_id = $1 AND s.worker_id = u.id) AS saved,
       count(*) OVER ()::int AS total FROM users u`)}
     WHERE ${where.join(' AND ')} ORDER BY ${match}${sort} LIMIT ${PAGE_SIZE} OFFSET ${add(page * PAGE_SIZE)}`,
    params);
  // past the last page there's no row to carry the total, so count separately
  const total = rows[0]?.total ?? (page ? (await pool.query(
    `SELECT count(*)::int AS n FROM users u JOIN worker_profiles p ON p.user_id = u.id WHERE $1::int IS NOT NULL AND ${where.join(' AND ')}`,
    params.slice(0, -1))).rows[0].n : 0);
  return { workers: rows.map(({ total: _, ...w }) => w), total };
}

export const findProfile = async (id) => (await pool.query(`${WORKER_SELECT} WHERE u.id = $1`, [id])).rows[0];

// The profiles of these workers, still in search (not suspended).
export const findProfiles = async (ids) =>
  ids.length ? (await pool.query(`${WORKER_SELECT} WHERE u.id = ANY($1) AND u.suspended_at IS NULL`, [ids])).rows : [];

// Whether this employer saved the worker, and when they hired them.
export const relationTo = async (employerId, workerId) => (await pool.query(
  `SELECT EXISTS (SELECT 1 FROM saved_workers WHERE employer_id = $1 AND worker_id = $2) AS saved,
     (SELECT created_at FROM hires WHERE employer_id = $1 AND worker_id = $2) AS hired_at`, [employerId, workerId])).rows[0];

// Of these workers, the ones this employer already knows here: they applied to one of the employer's jobs,
// or the two have messaged.
export const knownTo = async (employerId, workerIds) => (await pool.query(
  `SELECT a.worker_id AS id FROM applications a JOIN jobs j ON j.id = a.job_id WHERE j.employer_id = $1 AND a.worker_id = ANY($2)
   UNION SELECT recipient_id FROM messages WHERE sender_id = $1 AND recipient_id = ANY($2)
   UNION SELECT sender_id FROM messages WHERE recipient_id = $1 AND sender_id = ANY($2)`,
  [employerId, workerIds])).rows.map((r) => r.id);

export const isWorker = async (id) => (await pool.query("SELECT 1 FROM users WHERE id = $1 AND role = 'worker'", [id])).rowCount > 0;

// --- Saved workers and hires ---

export const save = (employerId, workerId) =>
  pool.query('INSERT INTO saved_workers (employer_id, worker_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [employerId, workerId]);
export const unsave = (employerId, workerId) =>
  pool.query('DELETE FROM saved_workers WHERE employer_id = $1 AND worker_id = $2', [employerId, workerId]);

// Most recently saved first.
export const listSaved = async (employerId) => (await pool.query(
  `${WORKER_SELECT.replace(' FROM users u', ', true AS saved, s.created_at AS saved_at FROM users u')}
   JOIN saved_workers s ON s.worker_id = u.id AND s.employer_id = $1 ORDER BY s.created_at DESC LIMIT 200`, [employerId])).rows;

// `jobId` (or null) says which job they were hired for; marking again keeps the earlier job unless a new one is given.
export const hire = (employerId, workerId, jobId) => pool.query(
  `INSERT INTO hires (employer_id, worker_id, job_id) VALUES ($1, $2, $3)
   ON CONFLICT (employer_id, worker_id) DO UPDATE SET job_id = coalesce($3, hires.job_id)`, [employerId, workerId, jobId]);
export const unhire = (employerId, workerId) =>
  pool.query('DELETE FROM hires WHERE employer_id = $1 AND worker_id = $2', [employerId, workerId]);

export const listHires = async (employerId) => (await pool.query(
  `SELECT u.id, u.name, p.title, h.created_at AS hired_at, j.id AS job_id, j.title AS job_title
   FROM hires h JOIN users u ON u.id = h.worker_id LEFT JOIN worker_profiles p ON p.user_id = u.id LEFT JOIN jobs j ON j.id = h.job_id
   WHERE h.employer_id = $1 ORDER BY h.created_at DESC`, [employerId])).rows;

// --- The worker's own profile ---

// `fields`: title, bio, skills, hourly_rate, availability, portfolio_url, linkedin_url. `extra`: the bento
// fields that were sent ({ column: value }), so fields an older form doesn't know about stay as they are.
export const updateProfile = async (userId, f, extra) => {
  const cols = Object.keys(extra);
  return (await pool.query(
    `UPDATE worker_profiles SET title = $2, bio = $3, skills = $4, hourly_rate = $5, availability = $6,
       portfolio_url = $7, linkedin_url = $8, ${cols.map((c, i) => `${c} = $${i + 9}, `).join('')}updated_at = now()
     WHERE user_id = $1 RETURNING *`,
    [userId, f.title, f.bio, f.skills, f.hourly_rate, f.availability, f.portfolio_url, f.linkedin_url, ...Object.values(extra)])).rows[0];
};

export const findResume = async (userId) => (await pool.query(
  'SELECT resume_key, resume_name, show_resume FROM worker_profiles WHERE user_id = $1', [userId])).rows[0];
