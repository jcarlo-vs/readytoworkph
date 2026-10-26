'use client';
import { createContext, useContext, useState } from 'react';
import { API, read } from '@/lib/api';

// The admin panel has its own login (an HttpOnly cookie for /api/admin only), separate from user accounts.
export async function adminApi<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`${API}/admin${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null as T;
  return read<T>(res, 'Request failed');
}

// "Log in as": opens a worker's or employer's account in a new tab for 2 hours, no password needed. The tab opens
// during the click, so pop-up blockers allow it. This browser's normal login becomes that person (the admin login
// is separate and stays); log out there, or wait 2 hours, to end it.
export async function loginAs(id: number, onError: (err: Error) => void) {
  const tab = window.open('', '_blank');
  try {
    await adminApi(`/users/${id}/login-as`, 'POST');
    try { localStorage.setItem('signedIn', '1'); } catch { /* storage unavailable */ } // lib/auth.tsx only asks "who am I?" with this set
    if (tab) tab.location.href = '/dashboard';
  } catch (err) {
    tab?.close();
    onError(err as Error);
  }
}

// What every admin page can reach: log out (also on an expired login), and refresh the menu's counts.
export const AdminContext = createContext<{ logout: () => void; refreshCounts: () => void }>({ logout: () => {}, refreshCounts: () => {} });
export const useAdmin = () => useContext(AdminContext);
// Turns a failed request into "log out" when the admin login expired, otherwise an error message.
export const failed = (logout: () => void, setError: (m: string) => void) => (err: Error & { status?: number }) =>
  (err.status === 401 ? logout() : setError(err.message));

export const ago = (iso: string | null) => {
  if (!iso) return 'never';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : min < 1440 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} d ago`;
};
export const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-');
export const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const regionName = new Intl.DisplayNames(['en'], { type: 'region' });
export const flag = (code: string) => (/^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 127397 + c.charCodeAt(0))) : '🌐');
export const countryName = (code: string) => { try { return regionName.of(code) ?? code; } catch { return 'Unknown'; } };

export const PLAN_PILL: Record<string, string> = {
  free: 'bg-slate-100 text-slate-600', pro: 'bg-emerald-100 text-emerald-800', premium: 'bg-amber-100 text-amber-900',
};
export const pill = 'inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize';

export function PageHeader({ title, sub, children }: { title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">{title}</h1>
        {sub && <p className="text-sm text-slate-500">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: [T, string][]; label: string }) {
  return (
    <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1 text-sm" role="group" aria-label={label}>
      {options.map(([k, text]) => (
        <button key={k} type="button" onClick={() => onChange(k)} aria-pressed={value === k}
          className={`rounded-md px-3 py-1.5 font-medium transition ${value === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{text}</button>
      ))}
    </div>
  );
}

export function Search({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex w-full items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/20 sm:w-72">
      <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400">
        <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="m13.5 13.5 3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none" />
      {value && <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="text-slate-400 hover:text-slate-700">×</button>}
    </label>
  );
}

export const PAGE_SIZES = [10, 25, 50, 100];
// Rows per page, remembered for every admin table. Admin pages only render in the browser (after the login
// check), so reading localStorage on first render is safe.
export function usePageSize(): [number, (n: number) => void] {
  const [size, setSize] = useState(() => {
    try { const n = Number(localStorage.getItem('admin-rows')); return PAGE_SIZES.includes(n) ? n : 25; } catch { return 25; }
  });
  return [size, (n) => { setSize(n); try { localStorage.setItem('admin-rows', String(n)); } catch {} }];
}
// One page of a list that's already fully loaded.
export const pageOf = <T,>(list: T[], page: number, size: number) => list.slice(page * size, (page + 1) * size);

// "Rows [25] · 1-25 of 312 · ← Previous · Page 1 of 13 · Next →"; the page buttons only when there's more than one page.
export function Pager({ page, total, size, onPage, onSize, noun }: {
  page: number; total: number; size: number; onPage: (p: number) => void; onSize: (n: number) => void; noun: string;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const btn = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40';
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 text-sm" aria-label={`${noun} pages`}>
      <div className="flex items-center gap-3 text-slate-500">
        <label className="flex items-center gap-2 text-xs">
          Rows
          <select value={size} onChange={(e) => { onSize(Number(e.target.value)); onPage(0); }}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 focus:border-emerald-600 focus:outline-none">
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span className="tabular-nums">{total ? `${page * size + 1}-${Math.min(total, (page + 1) * size)} of ` : ''}{total.toLocaleString('en-US')} {noun}</span>
      </div>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <button type="button" className={btn} disabled={page === 0} onClick={() => onPage(page - 1)}>← Previous</button>
          <span className="text-xs tabular-nums text-slate-500">Page {page + 1} of {pages}</span>
          <button type="button" className={btn} disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>Next →</button>
        </div>
      )}
    </nav>
  );
}

export { th, td } from '@/components/styles'; // shared with the employer pages' tables
