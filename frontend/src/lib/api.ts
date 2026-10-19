'use client';
import { useEffect, useState } from 'react';

// Same address as the site: the live Worker forwards /api to the backend, and in development Next does
// (next.config.ts). The browser then sends the login cookie by itself; no token is handled in code.
export const API = '/api';

export type User = { id: number; email: string; name: string; role: 'worker' | 'employer'; has_photo?: boolean; plan?: 'free' | 'pro' | 'premium' };
export type Job = {
  id: number; employer_id: number; employer_name: string; title: string; description: string;
  skills: string[]; job_type: string; salary_period: SalaryPeriod;
  salary_min: number | string | null; salary_max: number | string | null; created_at: string;
  updated_at: string | null; closed_at: string | null; // amounts arrive as strings (Postgres numeric)
};
export type Worker = {
  id: number; name: string; title: string; bio: string; skills: string[];
  hourly_rate: string | null; availability: string; portfolio_url: string | null; linkedin_url: string | null;
  limited?: true; // shown to a Free employer who can't contact this worker yet: "Maria S.", no links
  member_since?: string; last_seen_at?: string | null; saved?: boolean; hired_at?: string | null;
};

export type Credits = { daily: number; used: number; remaining: number; resets_at: string };

// How strongly an application's credits signal interest; shown to workers when bidding and to employers on applicants.
export const interest = (credits: number) =>
  credits >= 20 ? { label: 'High interest', className: 'bg-amber-400 text-slate-900' }
  : credits >= 5 ? { label: 'Strong interest', className: 'bg-amber-100 text-amber-900' }
  : { label: 'Standard', className: 'bg-slate-100 text-slate-600' };

// Count of in-flight API requests, so the top loading bar can show while anything is fetching.
let inflight = 0;
const loadingListeners = new Set<() => void>();
export const loadingStore = {
  subscribe(fn: () => void) {
    loadingListeners.add(fn);
    return () => { loadingListeners.delete(fn); };
  },
  count: () => inflight,
};
const track = (delta: number) => { inflight += delta; loadingListeners.forEach((fn) => fn()); };

// An API error with its HTTP status, so callers can tell "logged out" (401) from a temporary problem.
export class ApiError extends Error {
  constructor(message: string, public status: number, public data: Record<string, unknown> | null = null) { super(message); }
}

// Reads a JSON response. Some answers aren't JSON: Cloudflare's "too many requests" block is plain
// text, and so are network or server outages. Those get a friendly message instead of a parse error.
export async function read<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => null);
  if (res.ok && data !== null) return data;
  if (res.status === 429) throw new ApiError(data?.error ?? 'You’re going a little fast. Please wait a few seconds and try again.', 429);
  if (res.status >= 500 && !data?.error) throw new ApiError('ReadyToWork.ph is having trouble right now. Please try again in a minute.', res.status);
  throw new ApiError(data?.error ?? fallback, res.status, data);
}

// fetch() itself fails when the visitor is offline or the site can't be reached at all.
async function send(url: string, init: RequestInit) {
  try {
    return await fetch(url, init);
  } catch {
    throw new ApiError('Can’t connect to ReadyToWork.ph. Check your internet connection and try again.', 0);
  }
}

// `quiet` requests (background refreshes) don't show the top loading bar.
export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; quiet?: boolean } = {}): Promise<T> {
  const step = opts.quiet ? 0 : 1;
  track(step);
  try {
    const res = await send(API + path, {
      method: opts.method ?? (opts.body ? 'POST' : 'GET'),
      headers: { 'content-type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 204) return null as T;
    return await read<T>(res, 'Something went wrong. Please try again.');
  } finally {
    track(-step);
  }
}

// Uploads a file as the raw request body (the backend checks type and size).
export async function uploadFile<T>(path: string, file: Blob, name = ''): Promise<T> {
  track(1);
  try {
    const res = await send(API + path, {
      method: 'PUT',
      headers: { 'content-type': file.type, 'x-file-name': encodeURIComponent(name) },
      body: file,
    });
    return await read<T>(res, 'Upload failed. Please try again.');
  } finally {
    track(-1);
  }
}

// Bumped after the signed-in user changes their photo, so every avatar on the page reloads it.
let photoVersion = 0;
const photoListeners = new Set<() => void>();
export const photoStore = {
  subscribe(fn: () => void) {
    photoListeners.add(fn);
    return () => { photoListeners.delete(fn); };
  },
  version: () => photoVersion,
  bump: () => { photoVersion++; photoListeners.forEach((fn) => fn()); },
};

export type Resume = { name: string; uploaded_at: string; url: string };

// When the person last moved the mouse, typed, scrolled or touched the screen. Background refreshes
// stop after 5 idle minutes (a tab left open all day would otherwise poll the server forever).
let lastActive = Date.now();
if (typeof window !== 'undefined') {
  for (const e of ['pointermove', 'keydown', 'scroll', 'touchstart']) window.addEventListener(e, () => { lastActive = Date.now(); }, { passive: true });
}
const IDLE_MS = 5 * 60_000;

// Fetches `path`; `refreshMs` re-fetches in the background, and `reload()` re-fetches on demand.
// `initial` is data the server already rendered the page with (shown at once, then refreshed).
export function useApi<T>(path: string | null, refreshMs?: number, initial?: T) {
  const [data, setData] = useState<T | null>(initial ?? null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(0); // HTTP status of the error, e.g. 404 when the thing doesn't exist
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    api<T>(path, { quiet: version > 0 }).then(
      (d) => { if (live) { setData(d); setError(''); } },
      (e) => { if (live) { setError(e.message); setStatus(e instanceof ApiError ? e.status : 0); } },
    );
    return () => { live = false; };
  }, [path, version]);
  // Background refresh pauses while the tab is hidden or the person is idle (saves server and database
  // work), and catches up as soon as they're back.
  useEffect(() => {
    if (!path || !refreshMs) return;
    let missed = false;
    const refresh = () => {
      if (document.hidden || Date.now() - lastActive > IDLE_MS) { missed = true; return; }
      missed = false;
      setVersion((v) => v + 1);
    };
    const back = () => { if (missed) refresh(); };
    const t = setInterval(refresh, refreshMs);
    document.addEventListener('visibilitychange', back);
    window.addEventListener('pointermove', back, { passive: true });
    window.addEventListener('keydown', back);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', back);
      window.removeEventListener('pointermove', back);
      window.removeEventListener('keydown', back);
    };
  }, [path, refreshMs]);
  return { data, error, status, reload: () => setVersion((v) => v + 1) };
}

export type Conversation = {
  user_id: number; name: string; role: User['role']; last_body: string; last_at: string; last_from_me: boolean; unread: number;
};
export type Message = {
  id: number; sender_id: number; body: string; created_at: string; read_at: string | null; job_id: number | null; job_title: string | null;
};
export type Thread = { user: Pick<User, 'id' | 'name' | 'role'>; can_send: boolean; messages: Message[] };

export type SalaryPeriod = 'hour' | 'month' | 'year' | 'fixed';
export const PAY_PERIODS: { value: SalaryPeriod; label: string }[] = [
  { value: 'month', label: 'Per month' },
  { value: 'hour', label: 'Per hour' },
  { value: 'year', label: 'Per year' },
  { value: 'fixed', label: 'Fixed price' },
];
export { salary } from './format';
