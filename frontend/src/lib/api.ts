'use client';
import { useEffect, useState } from 'react';

export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

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
};

export type Credits = { daily: number; used: number; remaining: number; resets_at: string };

// How strongly an application's credits signal interest; shown to workers when bidding and to employers on applicants.
export const interest = (credits: number) =>
  credits >= 20 ? { label: 'High interest', className: 'bg-amber-400 text-slate-900' }
  : credits >= 5 ? { label: 'Strong interest', className: 'bg-amber-100 text-amber-900' }
  : { label: 'Standard', className: 'bg-slate-100 text-slate-600' };

export const getToken = () => {
  try { return localStorage.getItem('token'); } catch { return null; }
};

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

// `quiet` requests (background refreshes) don't show the top loading bar.
export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; quiet?: boolean } = {}): Promise<T> {
  const token = getToken();
  const step = opts.quiet ? 0 : 1;
  track(step);
  try {
    const res = await fetch(API + path, {
      method: opts.method ?? (opts.body ? 'POST' : 'GET'),
      headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 204) return null as T;
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Request failed');
    return data;
  } finally {
    track(-step);
  }
}

// Uploads a file as the raw request body (the backend checks type and size).
export async function uploadFile<T>(path: string, file: Blob, name = ''): Promise<T> {
  const token = getToken();
  track(1);
  try {
    const res = await fetch(API + path, {
      method: 'PUT',
      headers: { 'content-type': file.type, 'x-file-name': encodeURIComponent(name), ...(token && { authorization: `Bearer ${token}` }) },
      body: file,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Upload failed');
    return data;
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

// Fetches `path`; `refreshMs` re-fetches in the background, and `reload()` re-fetches on demand.
export function useApi<T>(path: string | null, refreshMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    api<T>(path, { quiet: version > 0 }).then((d) => live && setData(d), (e) => live && setError(e.message));
    return () => { live = false; };
  }, [path, version]);
  // Background refresh pauses while the tab is hidden (saves server and database work),
  // and catches up as soon as the tab is visible again.
  useEffect(() => {
    if (!path || !refreshMs) return;
    const refresh = () => { if (!document.hidden) setVersion((v) => v + 1); };
    const t = setInterval(refresh, refreshMs);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', refresh); };
  }, [path, refreshMs]);
  return { data, error, reload: () => setVersion((v) => v + 1) };
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
const PERIOD_SUFFIX: Record<SalaryPeriod, string> = { hour: '/hr', month: '/mo', year: '/yr', fixed: ' fixed' };
// "$7.50", "$1,200" (cents only when there are any)
const usd = (v: number | string) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: Number(v) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

export const salary = (j: Pick<Job, 'salary_min' | 'salary_max'> & { salary_period?: SalaryPeriod }) => {
  const per = PERIOD_SUFFIX[j.salary_period ?? 'month'];
  const [min, max] = [Number(j.salary_min) || 0, Number(j.salary_max) || 0];
  return min && max ? (min === max ? `${usd(min)}${per}` : `${usd(min)} to ${usd(max)}${per}`)
    : min ? `From ${usd(min)}${per}`
    : max ? `Up to ${usd(max)}${per}` : 'Salary negotiable';
};
