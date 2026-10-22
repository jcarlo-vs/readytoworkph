'use client';
import Link from 'next/link';
import { tableCard } from '@/components/styles';
import { useApi } from '@/lib/api';
import { ErrorText, Initials, TimeAgo } from '@/components/ui';

type Hire = { id: number; name: string; title: string | null; hired_at: string; job_id: number | null; job_title: string | null };

// My Hires: people this employer marked as hired (on a worker's profile: Mark as hired).
export default function HiresPage() {
  const { data: hires, error } = useApi<Hire[]>('/my/hires');
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">My Hires</h1>
        <p className="text-slate-500">People you hired. Open a profile and click <b>Mark as hired</b> to add someone.</p>
      </div>
      <ErrorText msg={error} />
      <div className={tableCard}>
        {hires?.length ? (
          <ul className="divide-y divide-slate-100">
            {hires.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50">
                <Initials name={h.name} id={h.id} size="h-9 w-9 text-xs" />
                <div className="min-w-0 flex-1">
                  <Link href={`/workers/${h.id}`} className="font-semibold text-slate-900 hover:text-emerald-800">{h.name}</Link>
                  <p className="truncate text-xs text-slate-500">{h.title || 'No title'}{h.job_title && <> · for {h.job_title}</>} · hired <TimeAgo date={h.hired_at} /></p>
                </div>
                <Link href={`/messages?with=${h.id}`} className="rounded-lg bg-emerald-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900">Message</Link>
                <Link href={`/workers/${h.id}`} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">Profile</Link>
              </li>
            ))}
          </ul>
        ) : <p className="p-6 text-center text-slate-500">{hires ? 'No hires yet.' : 'Loading…'}</p>}
      </div>
    </div>
  );
}
