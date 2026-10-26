// Worker profiles: what each employer may see, and the profile form's fields.
import { PLAN_LIMITS } from '../../config.js';
import { pool } from '../../db/index.js';
import { hideContacts, shortName } from '../../lib/contacts.js';
import { str } from '../../lib/validate.js';
import { planOf } from '../../services/plans.js';
import { getSettings } from '../../services/settings.js';
import * as Workers from './workers.model.js';

// A worker's surname, LinkedIn and portfolio would let an employer find them elsewhere and skip both the
// upgrade and our messaging. So an employer sees them only once they may contact the worker here anyway:
// on a paid plan, or when the worker applied to one of their jobs, or they already have a conversation.
// Everyone else sees "Maria S." and no links (`limited: true`, so the page can say how to see more).
export async function revealFor(employerId, workerIds) {
  if (PLAN_LIMITS[await planOf(pool, employerId)].outreach) return () => true;
  const known = new Set(await Workers.knownTo(employerId, workerIds));
  return (id) => known.has(id);
}

const limitWorker = (w, fullName = false) => ({
  ...w, name: fullName ? w.name : shortName(w.name), name_hidden: !fullName, title: hideContacts(w.title), bio: hideContacts(w.bio),
  location: hideContacts(w.location), languages: hideContacts(w.languages),
  portfolio_url: null, linkedin_url: null, limited: true,
});

// How one employer sees these workers: in full, or limited (the admin can let Free employers see full names).
// Never the birth date itself; the age is enough.
export async function workerViews(employerId, ids) {
  const full = await revealFor(employerId, ids);
  const { free_full_names } = await getSettings();
  return ({ birth_date: _, ...w }) => (full(w.id) ? w : limitWorker(w, free_full_names));
}

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
