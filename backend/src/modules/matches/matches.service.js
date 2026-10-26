// Smart Matching: allowance, the agent's search tools, and how a saved run is shown.
import { PLAN_LIMITS } from '../../config.js';
import { hideContacts } from '../../lib/contacts.js';
import { str } from '../../lib/validate.js';
import { findProfiles } from '../workers/workers.model.js';
import { revealFor, workerViews } from '../workers/workers.service.js';
import * as Matches from './matches.model.js';

// A run holds its request open while it streams steps (Cloud Run only gives CPU during a request), so runs are
// capped per server to leave room for everyone else's pages.
export const MAX_LIVE_RUNS = 20;

// Pro gets 3 runs a month, Premium 30 (PLAN_LIMITS). Interrupted and failed runs don't count.
export async function matchUsage(db, employerId) {
  const r = await Matches.usageThisMonth(employerId, db);
  const limit = PLAN_LIMITS[r.plan].matches;
  return { plan: r.plan, used: r.used, limit, remaining: Math.max(0, limit - r.used) };
}

export const payText = (j) => (j.salary_min == null && j.salary_max == null ? ''
  : `$${[j.salary_min, j.salary_max].filter((v) => v != null).map(Number).join('-')} ${j.salary_period === 'fixed' ? 'fixed price' : `per ${j.salary_period}`}`);

// The agent's tools, scoped to one employer: the same search and privacy rules as Hire Talent ("Maria S.",
// no links, contact details hidden, unless that employer may contact the worker), in a compact form.
const daysAgo = (t) => (t ? Math.floor((Date.now() - new Date(t).getTime()) / 86_400_000) : null);

const agentCard = (w) => ({
  id: w.id, name: w.name, title: w.title, skills: w.skills, hourly_rate: w.hourly_rate, availability: w.availability,
  hours_per_week: w.hours_per_week, work_hours: w.work_hours, last_active_days_ago: daysAgo(w.last_seen_at),
});

export function matchTools(employerId) {
  return {
    async search(filters) {
      const rows = await Matches.searchWorkers(filters);
      const view = await workerViews(employerId, rows.map((w) => w.id));
      return rows.map((w) => agentCard(view(w)));
    },
    async profile(id) {
      const w = await Matches.findSearchableWorker(id);
      if (!w) return null;
      const full = (await revealFor(employerId, [id]))(id);
      const v = (await workerViews(employerId, [id]))(w);
      // The CV text, when the worker shares their CV and this employer may download it (the same rule as the CV button).
      const cv = full && w.has_resume ? await Matches.findResumeText(id) : null;
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

export async function matchRunView(employerId, run, job) {
  if (!run) return null;
  const cap = hourlyCap(job);
  const ids = (run.shortlist ?? []).map((m) => m.worker_id);
  const view = await workerViews(employerId, ids);
  const workers = new Map((await findProfiles(ids)).map((w) => [w.id, view(w)]));
  const hired = await Matches.hiredAmong(employerId, ids);
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
