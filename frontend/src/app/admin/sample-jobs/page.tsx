'use client';
import { useCallback, useEffect, useState } from 'react';
import { ErrorText, button, card, input } from '@/components/ui';
import { PageHeader, adminApi, failed, useAdmin } from '../ui';

type Status = { total: number; planned: number; posted: number; next_at: string | null };
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });

// The sample-job autopilot: how many a day, what it has done today, and buttons to post one now or remove them all.
export default function SampleJobsPage() {
  const { logout } = useAdmin();
  const [perDay, setPerDay] = useState<{ form: number; saved: number } | null>(null);
  const [s, setS] = useState<Status | null>(null);
  const [sure, setSure] = useState(false);
  const [fill, setFill] = useState({ count: 40, busy: false });
  const [msg, setMsg] = useState<{ ok: string; error: string; fill: boolean; today?: boolean }>({ ok: '', error: '', fill: false }); // which form the message is about
  const fail = failed(logout, (error) => setMsg({ ok: '', error, fill: false }));
  const load = useCallback(() => adminApi<Status>('/sample-jobs').then(setS, failed(logout, (error) => setMsg({ ok: '', error, fill: false }))), [logout]);
  useEffect(() => {
    adminApi<{ sample_jobs_per_day: number }>('/settings').then(({ sample_jobs_per_day: n }) => setPerDay({ form: n, saved: n }), failed(logout, (error) => setMsg({ ok: '', error, fill: false })));
    load();
  }, [logout, load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { sample_jobs_per_day: n } = await adminApi<{ sample_jobs_per_day: number }>('/settings', 'PUT', { sample_jobs_per_day: perDay!.form });
      setPerDay({ form: n, saved: n });
      setMsg({ ok: 'Saved.', error: '', fill: false });
      load();
    } catch (err) { fail(err as Error); }
  }
  const act = (method: 'POST' | 'DELETE') => {
    setMsg({ ok: '', error: '', fill: false });
    adminApi<{ deleted?: number; closed?: number }>('/sample-jobs', method).then((r) => {
      setSure(false); load();
      if (method === 'DELETE') setMsg({ ok: `Deleted ${r.deleted}.${r.closed ? ` Closed ${r.closed} that real workers applied to, so their applications stay.` : ''}`, error: '', fill: false, today: true });
    }, fail);
  };
  const small = 'rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold';
  const backfill = (e: React.FormEvent) => {
    e.preventDefault();
    setFill({ ...fill, busy: true }); setMsg({ ok: '', error: '', fill: true });
    adminApi('/sample-jobs', 'POST', { count: fill.count })
      .then(() => { setMsg({ ok: `Added ${fill.count} sample jobs, dated over the past hours.`, error: '', fill: true }); load(); }, fail)
      .finally(() => setFill((f) => ({ ...f, busy: false })));
  };

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Sample jobs" sub="Made-up jobs from 25 sample employers, so the job board looks active" />
      <form onSubmit={save} className={`${card} space-y-3`}>
        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="font-medium text-slate-900">Sample jobs per day</p>
            <p className="text-sm text-slate-500">Posted at random times, 6am to 11:30pm Manila time, at least an hour apart (closer together above 17 a day, so they all fit). They work like real jobs: workers can apply, and you can use Log in as to see applicants and message them. Google doesn&apos;t list them. 0 turns it off. Up to 50.</p>
          </div>
          {perDay && (
            <div className="w-24 shrink-0"><input className={`${input} text-center`} type="number" min={0} max={50} required aria-label="Sample jobs per day"
              value={perDay.form} onChange={(e) => setPerDay({ ...perDay, form: Math.trunc(Number(e.target.value)) })} /></div>
          )}
        </div>
        {msg.ok && !msg.fill && !msg.today && perDay?.form === perDay?.saved && <p className="text-sm font-medium text-emerald-700" role="status">{msg.ok}</p>}
        <button className={`${button} disabled:opacity-50`} disabled={!perDay || perDay.form === perDay.saved}>Save</button>
      </form>
      <section className={`${card} space-y-3 text-sm`}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Today</h2>
        {s ? (
          <p className="text-slate-700">
            {s.total.toLocaleString('en-US')} sample job{s.total === 1 ? '' : 's'} on the site.
            {s.planned > 0 && <> Today: {s.posted} of {s.planned} posted{s.next_at ? `, next at ${time(s.next_at)} (Manila)` : ''}.</>}
          </p>
        ) : <p className="text-slate-500">Loading…</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => act('POST')} className={`${small} border-slate-300 text-slate-700 hover:bg-slate-50`}>Post one now</button>
          <button type="button" onClick={() => (sure ? act('DELETE') : setSure(true))} disabled={!s?.total}
            className={`${small} border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50`}>{sure ? `Yes, delete all ${s?.total}` : 'Delete all sample jobs'}</button>
          <a href="/admin/jobs" className={`${small} border-slate-300 text-slate-700`}>See them in Jobs</a>
        </div>
        <p className="text-xs text-slate-500">Delete all removes every sample job. Ones that real workers applied to are closed instead, so their applications stay.</p>
        {msg.ok && msg.today && <p className="text-sm font-medium text-emerald-700" role="status">{msg.ok}</p>}
      </section>
      <form onSubmit={backfill} className={`${card} space-y-3`}>
        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="font-medium text-slate-900">Fill the board now</p>
            <p className="text-sm text-slate-500">Adds this many sample jobs at once, dated over the past hours (at least 30 minutes apart, about 45 on average), so the board doesn&apos;t start empty. They use their own 56 roles (AI, automation, modern web and video, and more), separate from the daily ones, and don&apos;t count toward today&apos;s plan. Up to 100.</p>
          </div>
          <div className="w-24 shrink-0"><input className={`${input} text-center`} type="number" min={1} max={100} required aria-label="How many sample jobs to add"
            value={fill.count} onChange={(e) => setFill({ ...fill, count: Math.trunc(Number(e.target.value)) })} /></div>
        </div>
        {msg.ok && msg.fill && <p className="text-sm font-medium text-emerald-700" role="status">{msg.ok}</p>}
        <button className={`${button} disabled:opacity-50`} disabled={fill.busy}>{fill.busy ? 'Adding…' : `Add ${fill.count} jobs`}</button>
      </form>
      <ErrorText msg={msg.error} />
    </div>
  );
}
