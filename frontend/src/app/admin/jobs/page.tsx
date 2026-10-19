'use client';
import { useEffect, useState } from 'react';
import { ErrorText, card } from '@/components/ui';
import { PLAN_PILL, PageHeader, Pager, Search, Seg, adminApi, date, failed, pill, td, th, useAdmin } from '../ui';

type Job = {
  id: number; title: string; job_type: string; created_at: string; closed_at: string | null;
  employer_id: number; employer_name: string; employer_email: string; plan: string; applicants: number;
};

// Every job post, newest first. Close a post that's spam or a scam (it leaves search and stops taking
// applications; the employer still sees it), or reopen one closed by mistake.
export default function Jobs() {
  const { logout } = useAdmin();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | 'open' | 'closed'>('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ jobs: Job[]; total: number; page_size: number } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      adminApi<typeof data>(`/jobs?${new URLSearchParams({ q, status, page: String(page) })}`).then(setData, failed(logout, setError));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, status, page, logout]);

  async function setClosed(job: Job, closed: boolean) {
    setBusy(job.id); setError('');
    try {
      await adminApi(`/jobs/${job.id}/closed`, 'PUT', { closed });
      setData((d) => d && { ...d, jobs: d.jobs.map((j) => (j.id === job.id ? { ...j, closed_at: closed ? new Date().toISOString() : null } : j)) });
    } catch (err) {
      failed(logout, setError)(err as Error);
    } finally {
      setBusy(0);
    }
  }

  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(0); };
  return (
    <>
      <PageHeader title="Jobs" sub={data ? `${data.total.toLocaleString('en-US')} ${status || ''} job posts${q ? ` matching "${q}"` : ''}` : ' '}>
        <Search value={q} onChange={reset(setQ)} placeholder="Search title or employer" />
      </PageHeader>
      <Seg label="Status" value={status} onChange={reset(setStatus)} options={[['', 'All'], ['open', 'Open'], ['closed', 'Closed']]} />
      <ErrorText msg={error} />
      <section className={`${card} overflow-x-auto p-0`}>
        <table className="w-full min-w-[920px] text-sm">
          <thead className="border-b border-slate-200">
            <tr><th className={th}>Job</th><th className={th}>Employer</th><th className={th}>Applicants</th><th className={th}>Posted</th><th className={th}>Status</th><th className={`${th} text-right`}>Action</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!data && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>}
            {data?.jobs.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No job posts match.</td></tr>}
            {data?.jobs.map((j) => (
              <tr key={j.id} className="hover:bg-slate-50">
                <td className={`${td} max-w-sm`}>
                  <a href={`/jobs/${j.id}`} target="_blank" rel="noopener noreferrer" className="block font-medium text-emerald-800 hover:underline">{j.title} ↗</a>
                  <span className="block text-xs capitalize text-slate-500">{j.job_type}</span>
                </td>
                <td className={`${td} min-w-56`}>
                  <span className="block whitespace-nowrap text-slate-900">{j.employer_name} <span className={`${pill} ${PLAN_PILL[j.plan]}`}>{j.plan}</span></span>
                  <span className="block select-all text-xs text-slate-500">{j.employer_email}</span>
                </td>
                <td className={`${td} tabular-nums text-slate-700`}>{j.applicants}</td>
                <td className={`${td} whitespace-nowrap text-slate-600`}>{date(j.created_at)}</td>
                <td className={td}><span className={`${pill} ${j.closed_at ? 'bg-slate-800 text-white' : 'bg-emerald-50 text-emerald-800'}`}>{j.closed_at ? 'Closed' : 'Open'}</span></td>
                <td className={`${td} text-right`}>
                  <button type="button" disabled={busy === j.id} onClick={() => setClosed(j, !j.closed_at)}
                    className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${j.closed_at ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50' : 'border-red-200 bg-white text-red-700 hover:bg-red-50'}`}>
                    {busy === j.id ? 'Saving…' : j.closed_at ? 'Reopen' : 'Close post'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {data && <Pager page={page} total={data.total} size={data.page_size} onPage={setPage} noun="job posts" />}
    </>
  );
}
