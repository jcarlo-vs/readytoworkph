'use client';
import Link from 'next/link';
import { Select } from '@/components/Select';
import { tableCard, theadRow } from '@/components/styles';
import { useEffect, useMemo, useState } from 'react';
import { useApi } from '@/lib/api';
import { ErrorText, InfoTip, Interest, CREDITS_INFO, TimeAgo } from '@/components/ui';
import { BulkMessage } from '@/components/BulkMessage';

type Row = {
  id: number; created_at: string; credits: number; score: number | null; job_id: number; job_title: string;
  worker_id: number; name: string; title: string | null; hourly_rate: string | null;
  deleted: boolean; deactivated: boolean; is_new: boolean; messaged: boolean; hired: boolean;
};
type Data = { applicants: Row[]; hidden: number; bulk_max: number };
const STATUS = { all: 'Everyone', new: 'New', waiting: 'Not messaged yet', messaged: 'Messaged', hired: 'Hired' } as const;
const SORT = { newest: 'Newest', credits: 'Most interested', score: 'Highest Smart Score' } as const;
const toOptions = (o: Record<string, string>) => Object.entries(o).map(([value, label]) => ({ value, label }));

// Applicants: everyone who applied to any of your jobs, in one table you can filter, sort and message in bulk.
export default function ApplicantsPage() {
  const { data, error, reload } = useApi<Data>('/my/applicants');
  useEffect(() => { if (data) window.dispatchEvent(new Event('rp:applicants-seen')); }, [data]); // opening clears the 🔔
  const [job, setJob] = useState('all');
  const [status, setStatus] = useState<keyof typeof STATUS>('all');
  const [sort, setSort] = useState<keyof typeof SORT>('newest');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [composing, setComposing] = useState(false);
  const [note, setNote] = useState('');

  const jobs = useMemo(() => [...new Map((data?.applicants ?? []).map((r) => [r.job_id, r.job_title])).entries()], [data]);
  const rows = (data?.applicants ?? [])
    .filter((r) => job === 'all' || r.job_id === Number(job))
    .filter((r) => status === 'all' || (status === 'new' ? r.is_new : status === 'waiting' ? !r.messaged && !r.hired : status === 'messaged' ? r.messaged : r.hired))
    .sort((a, b) => sort === 'credits' ? b.credits - a.credits : sort === 'score' ? (b.score ?? -1) - (a.score ?? -1) : 0);
  const canMessage = (r: Row) => !r.deleted && !r.deactivated;
  const selectable = rows.filter(canMessage);
  const allOn = selectable.length > 0 && selectable.every((r) => picked.has(r.id));
  const toggle = (id: number) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const chosen = (data?.applicants ?? []).filter((r) => picked.has(r.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500"><Link href="/dashboard/jobs" className="hover:text-emerald-700 hover:underline">My Job Posts</Link> / All applicants</p>
          <h1 className="text-xl font-bold text-slate-900">All applicants <span className="font-normal text-slate-400">{data ? data.applicants.length : ''}</span></h1>
          <p className="text-slate-500">Everyone who applied to your jobs. Tick people to message them all at once.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select label="Job" searchable noun="jobs" className="w-56" value={job} onChange={setJob}
            options={[{ value: 'all', label: 'All jobs' }, ...jobs.map(([id, title]) => ({ value: String(id), label: title }))]} />
          <Select label="Status" className="w-44" value={status} onChange={(v) => setStatus(v as keyof typeof STATUS)} options={toOptions(STATUS)} />
          <Select label="Sort" className="w-52" value={sort} onChange={(v) => setSort(v as keyof typeof SORT)} options={toOptions(SORT)} />
        </div>
      </div>

      {picked.size > 0 && (
        <div className="sticky top-16 z-10 flex flex-wrap items-center gap-3 rounded-lg bg-emerald-950 px-4 py-2 text-sm text-white shadow-lg">
          <b>{picked.size} selected</b>
          <button type="button" onClick={() => setComposing(true)} className="rounded-lg bg-amber-400 px-3 py-1 font-semibold text-slate-900 hover:bg-amber-300">Message {picked.size}</button>
          <button type="button" onClick={() => setPicked(new Set())} className="text-emerald-100 hover:text-white">Clear</button>
          {data && picked.size > data.bulk_max && <span className="text-amber-200">Up to {data.bulk_max} at once</span>}
        </div>
      )}
      {note && <p className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-900" role="status">{note}</p>}
      <ErrorText msg={error} />

      <div className={`${tableCard} overflow-x-auto`}>
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className={theadRow}>
              <th className="w-10 px-3 py-2.5"><input type="checkbox" aria-label="Select everyone shown" checked={allOn} disabled={!selectable.length}
                onChange={() => setPicked(allOn ? new Set() : new Set(selectable.map((r) => r.id)))} className="h-4 w-4 accent-emerald-700" /></th>
              <th className="px-2 py-2.5 font-semibold">Applicant</th>
              <th className="px-2 py-2.5 font-semibold">Job</th>
              <th className="px-2 py-2.5 font-semibold">Rate</th>
              <th className="px-2 py-2.5 font-semibold"><span className="inline-flex items-center gap-1.5">Interest <InfoTip text={CREDITS_INFO} label="Interest" /></span></th>
              <th className="px-2 py-2.5 font-semibold">Smart Score</th>
              <th className="px-2 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 text-right font-semibold">Applied</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 [&>tr]:transition-colors [&>tr:hover]:bg-slate-50">
            {rows.map((r) => (
              <tr key={r.id} className={picked.has(r.id) ? 'bg-emerald-50/60' : r.is_new ? 'bg-amber-50/40' : ''}>
                <td className="px-3 py-2.5"><input type="checkbox" aria-label={`Select ${r.name}`} checked={picked.has(r.id)} disabled={!canMessage(r)} onChange={() => toggle(r.id)} className="h-4 w-4 accent-emerald-700" /></td>
                <td className="px-2 py-2.5">
                  <Link href={`/dashboard/jobs/${r.job_id}#applicant-${r.id}`} className={`text-slate-900 hover:text-emerald-800 hover:underline ${r.is_new ? 'font-bold' : 'font-medium'}`}>{r.deleted ? 'Deleted user' : r.name}</Link>
                  {r.is_new && <span className="ml-1.5 text-[10px] font-bold text-amber-700">NEW</span>}
                  <span className="block truncate text-xs text-slate-500">{r.deactivated ? 'Paused · not taking messages' : r.title || 'No title'}</span>
                </td>
                <td className="max-w-48 truncate px-2 py-2.5 text-slate-600">{r.job_title}</td>
                <td className="px-2 py-2.5 tabular-nums">{r.hourly_rate ? `$${Number(r.hourly_rate)}/hr` : '-'}</td>
                <td className="px-2 py-2.5"><Interest credits={r.credits} /></td>
                <td className="px-2 py-2.5 tabular-nums">{r.score ?? <Link href={`/dashboard/jobs/${r.job_id}#applicant-${r.id}`} className="text-xs text-emerald-700 hover:underline">Get</Link>}</td>
                <td className="px-2 py-2.5 text-xs">{r.hired ? <span className="font-semibold text-emerald-700">Hired</span> : r.messaged ? 'Messaged' : <span className="text-slate-400">-</span>}</td>
                <td className="px-3 py-2.5 text-right text-xs text-slate-500"><TimeAgo date={r.created_at} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !rows.length && <p className="p-6 text-center text-slate-500">{data.applicants.length ? 'No one matches these filters.' : 'No applicants yet. They’ll show up here as people apply to your jobs.'}</p>}
        {!data && !error && <p className="p-6 text-center text-slate-500">Loading…</p>}
      </div>
      {!!data?.hidden && (
        <p className="rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-950">
          {data.hidden} more {data.hidden === 1 ? 'applicant is' : 'applicants are'} hidden on your plan. <Link href="/pricing" className="font-semibold underline">Upgrade to see everyone</Link>
        </p>
      )}
      {composing && <BulkMessage rows={chosen} max={data?.bulk_max ?? 50} onClose={() => setComposing(false)} onRemove={toggle}
        onSent={(text) => { setComposing(false); setPicked(new Set()); setNote(text); reload(); }} />}
    </div>
  );
}
