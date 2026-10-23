'use client';
import Link from 'next/link';
import { tableCard, theadRow } from '@/components/styles';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, salary, useApi, type Job } from '@/lib/api';
import { CloseJobDialog } from '@/components/JobOwnerActions';
import { ErrorText, TimeAgo, buttonGold } from '@/components/ui';

type MyJob = Job & { applicant_count: number; new_count: number };

// Row actions: same-size outlined buttons with an icon; Applicants is the main one, Close/Reopen are tinted.
const act = 'inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold shadow-sm transition active:scale-[0.97] disabled:opacity-50';
const ICONS = {
  people: 'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  pencil: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  unlock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 7.8-1.2',
};
const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

// My Job Posts: every job this employer posted, open or closed, with its applicants one click away.
export default function JobPostsPage() {
  const router = useRouter();
  const { data: jobs, error, reload } = useApi<MyJob[]>('/my/jobs');
  const { data: posts } = useApi<{ used: number; limit: number }>('/my/post-usage');
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const open = jobs?.filter((j) => !j.closed_at) ?? [];
  const closed = jobs?.filter((j) => j.closed_at) ?? [];
  const list = tab === 'open' ? open : closed;
  // Close (asks first, as on the job page) or reopen a job right from the list.
  const [closing, setClosing] = useState<MyJob | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');
  async function setClosed(job: MyJob, closed: boolean) {
    setBusy(job.id); setActionError('');
    try {
      await api(`/jobs/${job.id}/closed`, { method: 'PUT', body: { closed } });
      setClosing(null);
      reload();
    } catch (err) {
      setActionError(`${job.title}: ${(err as Error).message}`);
      setClosing(null);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">My Job Posts</h1>
          <p className="text-slate-500">{posts ? `${posts.used} of ${posts.limit} job posts used this month` : ' '}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/dashboard/applicants" className="rounded-lg px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-slate-200 hover:ring-emerald-600">All applicants</Link>
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs" role="group" aria-label="Show">
            {(['open', 'closed'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t}
                className={`rounded-md px-3 py-1.5 font-medium capitalize ${tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                {t} {t === 'open' ? open.length : closed.length}
              </button>
            ))}
          </div>
          <Link href="/jobs/new" className={`${buttonGold} px-4 py-1.5 text-sm`}>Post a job</Link>
        </div>
      </div>
      <ErrorText msg={error || actionError} />

      <div className={`${tableCard} overflow-x-auto`}>
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className={theadRow}>
              <th className="px-4 py-2.5 font-semibold">Job</th>
              <th className="px-2 py-2.5 font-semibold">Applicants</th>
              <th className="px-2 py-2.5 font-semibold">Posted</th>
              <th className="px-4 py-2.5 text-right font-semibold"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 [&>tr]:transition-colors [&>tr:hover]:bg-slate-50">
            {list.map((j) => (
              // The whole row opens the applicants; its own links (View, Edit…) still go where they say.
              <tr key={j.id} className="cursor-pointer" onClick={(e) => { if (!(e.target as HTMLElement).closest('a, button')) router.push(`/dashboard/jobs/${j.id}`); }}>
                <td className="px-4 py-3">
                  <Link href={`/dashboard/jobs/${j.id}`} className="font-semibold text-slate-900 hover:text-emerald-800">{j.title}</Link>
                  <span className="block text-xs text-slate-500">{j.job_type[0].toUpperCase() + j.job_type.slice(1)} · {salary(j)}</span>
                </td>
                <td className="px-2 py-3 tabular-nums"><b>{j.applicant_count}</b>{j.new_count > 0 && <span className="ml-1.5 text-xs font-semibold text-amber-700">+{j.new_count} this week</span>}</td>
                <td className="px-2 py-3 text-slate-500"><TimeAgo date={j.created_at} /></td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold">
                  <span className="inline-flex items-center justify-end gap-1.5">
                    <Link href={`/dashboard/jobs/${j.id}`} className={`${act} border-emerald-950 bg-emerald-950 text-white hover:bg-emerald-900`}><Icon d={ICONS.people} />Applicants</Link>
                    <Link href={`/jobs/${j.id}`} className={`${act} border-slate-300 bg-white text-slate-800 hover:border-emerald-600 hover:text-emerald-800`}><Icon d={ICONS.eye} />View</Link>
                    <Link href={`/jobs/${j.id}/edit`} className={`${act} border-slate-300 bg-white text-slate-800 hover:border-emerald-600 hover:text-emerald-800`}><Icon d={ICONS.pencil} />Edit</Link>
                    {j.closed_at
                      ? <button type="button" onClick={() => setClosed(j, false)} disabled={busy === j.id} className={`${act} border-emerald-300 bg-emerald-50 text-emerald-800 hover:border-emerald-600 hover:bg-emerald-100`}><Icon d={ICONS.unlock} />{busy === j.id ? 'Reopening…' : 'Reopen'}</button>
                      : <button type="button" onClick={() => setClosing(j)} className={`${act} border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-500 hover:bg-amber-100`}><Icon d={ICONS.lock} />Close</button>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {jobs && !list.length && (
          <p className="p-6 text-center text-slate-500">{tab === 'open' ? <>No open jobs. <Link href="/jobs/new" className="font-medium text-emerald-700 hover:underline">Post a job</Link></> : 'No closed jobs.'}</p>
        )}
        {!jobs && !error && <p className="p-6 text-center text-slate-500">Loading…</p>}
      </div>
      <p className="text-xs text-slate-500">To delete a job, open it with View.</p>
      {closing && <CloseJobDialog job={closing} open busy={busy === closing.id} onCancel={() => setClosing(null)} onConfirm={() => setClosed(closing, true)} />}
    </div>
  );
}
