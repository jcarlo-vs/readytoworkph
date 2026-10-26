// Made-up employers and jobs: the local seed script (seed-jobs.js) and the sample-job autopilot below.
import * as SampleJobs from './sample-jobs.model.js';
import { TYPES } from '../../config.js';
import { sampleDescription } from './sample-posts.js';
import { FILL_ROLES, ROLES } from './sample-roles.js';

export const pick = (a) => a[Math.floor(Math.random() * a.length)];

export const COMPANIES = ['Brightlane Studio', 'Harbor & Pine', 'Northwind Goods', 'Kettle Creek Media', 'Bluefin Logistics',
  'Copperleaf Dental', 'Maple Row Realty', 'Tidewater Labs', 'Sunday Supply Co', 'Granite Peak Coaching',
  'Lumen Health Partners', 'Orchard Lane Bakery', 'Saltbox Design', 'Ridgeway Accounting', 'Fable & Fern',
  'Pinecrest Property Group', 'Wavelength Podcasts', 'Oak & Anchor Legal', 'Summit Fitness Online', 'Little Owl Learning',
  'Cobalt Commerce', 'Meadowbrook Pets', 'Ironbridge Solar', 'Juniper Travel', 'Starling Software'];

export const TAGS = ['', '', '', ' (US hours)', ' (AU clients)', ' (UK hours)', ' - Long term', ' - Start ASAP'];
// One employer account per company (…@seed.test, an address that can never receive mail). Returns their ids.
export async function sampleEmployers(db) {
  return SampleJobs.upsertEmployers(COMPANIES.map((n) => `${n.toLowerCase().replace(/[^a-z]+/g, '.')}@seed.test`), COMPANIES, db);
}

// How people title their posts. `t` is the role, `job` the rest of the post.
const TITLES = [
  (t) => t, (t) => t, (t) => t + pick(TAGS),
  (t) => `${t} (Remote)`, (t) => `Hiring: ${t}`, (t) => `${t} Needed`, (t) => `${t} needed ASAP`,
  (t) => `Looking for ${/^[AEIOU]/.test(t) ? 'an' : 'a'} ${t}`, (t) => `Experienced ${t}`, (t) => `Long-term ${t}`,
  (t) => `[URGENT] ${t}`, (t) => `${t} - Work From Home`, (t, j) => `${t} | ${j.job_type.replace(/^./, (c) => c.toUpperCase())}`,
  (t, j) => `${t} - $${j.salary_min.toLocaleString('en-US')}-${j.salary_max.toLocaleString('en-US')}${j.salary_period === 'fixed' ? '' : `/${j.salary_period === 'hour' ? 'hr' : 'mo'}`}`,
  (t) => `${t} for a Growing Team`, (t) => `${t} (Filipino Applicants Only)`,
];
// The role's pay range, nudged up or down a little so the same role isn't always paid the same.
function nudge([min, max, period]) {
  const step = period === 'hour' ? 1 : period === 'month' ? 50 : 10;
  const f = 0.85 + Math.random() * 0.3;
  const lo = Math.max(step, Math.round((min * f) / step) * step);
  return [lo, Math.max(lo + step, Math.round((max * f) / step) * step), period];
}

// A random job: role, job type, pay, title and a full description.
// `recent`: titles of the latest sample jobs, so a role isn't used again until about 200 others have been.
// `roles`: the daily list, or the separate one for filling the board.
export function sampleJob(recent = [], roles = ROLES) {
  const fresh = roles.filter(([t]) => !recent.some((r) => r.includes(t)));
  const [title, skills, ...pay] = pick(fresh.length ? fresh : roles);
  const desc = pay.pop();
  const job_type = pick(TYPES);
  // A one-off price only fits a gig, and a monthly salary doesn't: a gig is priced like a few weeks of the
  // monthly pay, and a fixed-price role hired by the hour gets a typical rate.
  const [salary_min, salary_max, salary_period] = nudge(job_type !== 'gig' && pay[2] === 'fixed' ? [5, 10, 'hour']
    : job_type === 'gig' && pay[2] === 'month' ? [pay[0] * 0.3, pay[1] * 0.5, 'fixed'] : pay);
  const job = { skills, job_type, salary_min, salary_max, salary_period };
  return { ...job, title: pick(TITLES)(title, job).slice(0, 120), description: sampleDescription(job, title, skills, desc) };
}

export async function postSampleJob(db, employerIds, at = Date.now(), roles = ROLES) {
  await SampleJobs.createJob(pick(employerIds), sampleJob(await SampleJobs.recentTitles(db), roles), at, db);
}

// Fill the board at once: `count` sample jobs dated over the past hours, at least 30 minutes apart
// (about 45 minutes on average, so 40 jobs reach back about 30 hours), from their own list of roles (FILL_ROLES).
export async function backfillSampleJobs(db, count, now = Date.now()) {
  const ids = await sampleEmployers(db);
  for (const t of spread(count, now - count * 45 * 60_000, now - 5 * 60_000, HOUR / 2)) await postSampleJob(db, ids, t, FILL_ROLES);
}

// The sample-job autopilot (Admin › Sample jobs): `perDay` jobs a day at random times between 6am and 11:30pm
// Manila time, each from a random sample employer. There's no scheduler: the API calls this at most once a
// minute, and it posts whatever is due, dated to its planned time, so a job planned for 2:14pm says 2:14pm
// even if nobody visited until 3pm. The day's plan lives in the settings table (key sample_jobs_plan),
// locked while it runs, so two servers can't post the same job twice.
// ponytail: a day nobody visits until late keeps only the jobs still ahead; fine for a demo feed.
const HOUR = 3_600_000;
const PH = 8 * HOUR; // Manila is UTC+8 all year

// n random times between from and to, sorted, at least minGap apart (less only when that many can't fit).
// Random points in the window minus the gaps, then each shifted by its gaps: as random as before, never bunched.
export function spread(n, from, to, minGap = HOUR) {
  if (n <= 0 || from >= to) return [];
  const gap = Math.min(minGap, (to - from) / n);
  return Array.from({ length: n }, () => Math.random() * (to - from - gap * (n - 1)))
    .sort((x, y) => x - y).map((t, i) => Math.round(from + t + i * gap));
}
export const phDay = (t) => new Date(t + PH).toISOString().slice(0, 10);

export async function postDueSampleJobs(pool, perDay, now = Date.now()) {
  // Off: forget the rest of today's plan, so turning it back on later plans afresh instead of
  // posting everything that came due while it was off.
  if (!perDay) {
    if ((await SampleJobs.findPlan()).per_day) await SampleJobs.stopPlan();
    return 0;
  }
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    let { day, per_day, times = [], posted = 0 } = await SampleJobs.lockPlan(db);
    const today = phDay(now);
    if (day !== today || per_day !== perDay) { // a new day, or the admin changed the number: plan the rest of today
      const keep = day === today ? times.slice(0, posted) : [];
      const from = Math.max(now, Date.parse(`${today}T06:00:00+08:00`), (keep.at(-1) ?? 0) + HOUR), to = Date.parse(`${today}T23:30:00+08:00`);
      [day, per_day, times, posted] = [today, perDay, [...keep, ...spread(perDay - keep.length, from, to)], keep.length];
    }
    const due = times.slice(posted).filter((t) => t <= now);
    if (due.length) {
      const ids = await sampleEmployers(db);
      for (const t of due) await postSampleJob(db, ids, t);
    }
    await SampleJobs.savePlan({ day, per_day, times, posted: posted + due.length }, db);
    await db.query('COMMIT');
    return due.length;
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
}
