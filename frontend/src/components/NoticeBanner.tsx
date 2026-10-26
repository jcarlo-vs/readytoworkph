'use client';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useApi } from '@/lib/api';

// The site-wide notice the admin sets (Admin › Announcements), e.g. "Maintenance tonight 10pm". Plain text only.
// Closing it hides that notice in this browser; a new notice shows again. Not shown in the admin panel.
const KEY = 'rp:notice-closed';
export function NoticeBanner() {
  const path = usePathname();
  const { data } = useApi<{ notice: { text: string; tone: 'info' | 'warning' } | null }>('/settings');
  const [closed, setClosed] = useState(() => { try { return localStorage.getItem(KEY); } catch { return null; } });
  const notice = data?.notice;
  if (!notice || path.startsWith('/admin') || closed === notice.text) return null;
  const warn = notice.tone === 'warning';
  return (
    <div role="status" className={`flex items-center gap-3 px-4 py-2 text-sm ${warn ? 'bg-amber-400 text-slate-950' : 'bg-emerald-950 text-emerald-50'}`}>
      <p className="mx-auto max-w-5xl flex-1 text-center font-medium">{notice.text}</p>
      <button type="button" aria-label="Close this notice" onClick={() => { setClosed(notice.text); try { localStorage.setItem(KEY, notice.text); } catch { /* storage off */ } }}
        className={`rounded-full p-1 ${warn ? 'hover:bg-black/10' : 'hover:bg-white/10'}`}>
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" /></svg>
      </button>
    </div>
  );
}
