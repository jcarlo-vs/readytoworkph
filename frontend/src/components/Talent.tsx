'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';

// Shared pieces for showing workers to employers: the Save star, text with hidden contact details, rates.

// Contact details a Free employer can't see yet arrive from the server as this placeholder (the real text
// never reaches the browser). Each one shows as a blurred chip with a way to unlock it.
const HIDDEN = '[hidden: upgrade to see]';
export function MaskedText({ text, className = '' }: { text: string; className?: string }) {
  const parts = text.split(HIDDEN);
  if (parts.length === 1) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && (
            // The chip itself links to the plans; the tooltip sits flush on top of it (padding, not a gap),
            // so the pointer can move onto the tooltip's link without it closing.
            <span className="group relative z-10 inline-block align-baseline">
              <Link href="/pricing" onClick={(e) => e.stopPropagation()} className="select-none rounded bg-slate-100 px-1 text-slate-500 blur-[3px] hover:bg-amber-100">
                <span aria-hidden="true">upgrade to see</span>
                <span className="sr-only">Contact details hidden on the Free plan. See plans</span>
              </Link>
              <span className="absolute bottom-full left-1/2 z-10 hidden -translate-x-1/2 pb-1.5 group-hover:block">
                <span className="block whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg">
                  <Link href="/pricing" onClick={(e) => e.stopPropagation()} className="font-semibold text-amber-300 underline">Upgrade</Link> to see contact details
                </span>
              </span>
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

// ☆ Save / ★ Saved: bookmarks a worker for this employer. Updates at once; undoes itself if saving fails.
export function SaveButton({ workerId, saved: initial, compact = false }: { workerId: number; saved?: boolean; compact?: boolean }) {
  const [saved, setSaved] = useState(!!initial);
  const [busy, setBusy] = useState(false);
  async function toggle(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation(); // works inside a card link
    const next = !saved;
    setSaved(next); setBusy(true);
    try { await api(`/saved/${workerId}`, { method: next ? 'PUT' : 'DELETE', quiet: true }); } catch { setSaved(!next); } finally { setBusy(false); }
  }
  return (
    <button type="button" onClick={toggle} disabled={busy} aria-pressed={saved} aria-label={saved ? 'Remove from saved workers' : 'Save worker'}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border text-sm font-semibold transition ${compact ? 'px-2.5 py-1.5' : 'px-4 py-2'}
        ${saved ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100' : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-600 hover:text-emerald-800'}`}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
        <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3Z" />
      </svg>
      {compact ? (saved ? 'Saved' : 'Save') : saved ? 'Saved' : 'Save worker'}
    </button>
  );
}

// "$6.50/hr". No monthly estimate: we don't know a worker's hours, and a guess reads like their asking pay.
export function rateLine(rate: string | null) {
  if (!rate) return null;
  const hourly = Number(rate);
  return { hourly: `$${hourly.toLocaleString('en-US', { maximumFractionDigits: 2 })}/hr` };
}

// "Active now" for the last 10 minutes, then calendar days in Philippine time (where the workers are):
// today, yesterday, 3 days ago, 2 weeks ago, over a month ago. The server notes activity at most once a minute.
const phDay = (d: Date) => Math.floor(new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Manila' })).setHours(0, 0, 0, 0) / 864e5);
export const lastActive = (iso?: string | null) => {
  if (!iso) return 'Not active yet';
  const seen = new Date(iso);
  if (Date.now() - seen.getTime() < 10 * 60_000) return 'Active now';
  const days = phDay(new Date()) - phDay(seen);
  return days <= 0 ? 'Active today' : days === 1 ? 'Active yesterday' : days < 7 ? `Active ${days} days ago`
    : days < 30 ? `Active ${Math.floor(days / 7)} week${days < 14 ? '' : 's'} ago` : 'Active over a month ago';
};

// "1–20 of 312 workers · ← Previous · Page 1 of 16 · Next →"
export function Pager({ page, total, size, onPage, noun }: { page: number; total: number; size: number; onPage: (p: number) => void; noun: string }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (total <= size) return null;
  const btn = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40';
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 text-sm" aria-label={`${noun} pages`}>
      <span className="tabular-nums text-slate-500">{page * size + 1}–{Math.min(total, (page + 1) * size)} of {total.toLocaleString('en-US')} {noun}</span>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} disabled={page === 0} onClick={() => onPage(page - 1)}>← Previous</button>
        <span className="tabular-nums text-slate-500">Page {page + 1} of {pages}</span>
        <button type="button" className={btn} disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>Next →</button>
      </div>
    </nav>
  );
}
