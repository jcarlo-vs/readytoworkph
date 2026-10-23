'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useModal } from '@/components/useModal';
import { api, type Job } from '@/lib/api';
import { ErrorText } from '@/components/ui';

const icon = { viewBox: '0 0 24 24', className: 'h-3.5 w-3.5 shrink-0', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
const action = 'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50';
const LOCK = <svg {...icon}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;

const modalClass = 'mx-auto mt-[12vh] w-[min(32rem,calc(100vw-2rem))] rounded-2xl p-0 shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm';

// The owner's bar on their job post: whether it's taking applications, then Edit, Close (or Reopen) and a
// quiet Delete icon. Closing and deleting ask first.
export function JobOwnerActions({ job, onChange }: { job: Job; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<'close' | 'delete' | null>(null);

  async function setClosed(closed: boolean) {
    setBusy(true);
    setError('');
    try {
      await api(`/jobs/${job.id}/closed`, { method: 'PUT', body: { closed } });
      setConfirm(null);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white py-2 pl-4 pr-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Your job post</span>
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${job.closed_at ? 'text-slate-600' : 'text-emerald-800'}`}>
          <span className={`h-2 w-2 rounded-full ${job.closed_at ? 'bg-slate-400' : 'bg-emerald-500'}`} aria-hidden="true" />
          {job.closed_at ? 'Closed · not taking applications' : 'Open · taking applications'}
        </span>
        <span className="flex-1" />
        <Link href={`/jobs/${job.id}/edit?from=post`} className={`${action} border-emerald-950 bg-emerald-950 text-white hover:bg-emerald-900 focus-visible:ring-emerald-600/30`}>
          <svg {...icon}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>Edit job
        </Link>
        {job.closed_at ? (
          <button type="button" onClick={() => setClosed(false)} disabled={busy}
            className={`${action} border-emerald-600 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 focus-visible:ring-emerald-600/30`}>
            <svg {...icon}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" /></svg>{busy ? 'Reopening…' : 'Reopen job'}
          </button>
        ) : (
          <button type="button" onClick={() => setConfirm('close')}
            className={`${action} border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-400 hover:bg-amber-100 focus-visible:ring-amber-500/40`}>
            {LOCK}Close job
          </button>
        )}
        <button type="button" onClick={() => setConfirm('delete')} aria-label="Delete job" title="Delete job"
          className={`${action} w-8 shrink-0 justify-center border-red-200 bg-white px-0 text-red-600 hover:border-red-400 hover:bg-red-50 focus-visible:ring-red-500/30`}>
          <svg {...icon} className="h-4 w-4 shrink-0"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
        </button>
      </div>
      <ErrorText msg={error} />
      <CloseJobDialog job={job} open={confirm === 'close'} busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => setClosed(true)} />
      <DeleteJobDialog job={job} open={confirm === 'delete'} onClose={() => setConfirm(null)} onCloseInstead={() => setConfirm('close')} />
    </div>
  );
}

export function CloseJobDialog({ job, open, busy, onCancel, onConfirm }: { job: Job; open: boolean; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const dialog = useModal(open, onCancel);
  return (
    <dialog ref={dialog} onClose={onCancel} aria-labelledby="close-job-title"
      onClick={(e) => { if (e.target === dialog.current) onCancel(); }} className={modalClass}>
      <div className="space-y-4 p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">{LOCK}</span>
          <div>
            <h2 id="close-job-title" className="text-lg font-bold text-slate-900">Close this job?</h2>
            <p className="mt-1 text-sm text-slate-600">&quot;{job.title}&quot;</p>
          </div>
        </div>
        <ul className="space-y-1.5 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
          <li>• It stops accepting new applications</li>
          <li>• It&apos;s hidden from job search</li>
          <li>• Your applicants, Smart Scores and messages stay. You can still review and message them</li>
          <li>• You can reopen it anytime</li>
        </ul>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={busy}
            className="rounded-lg bg-emerald-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:opacity-50">
            {busy ? 'Closing…' : 'Close job'}
          </button>
        </div>
      </div>
    </dialog>
  );
}

// Deleting is permanent, so it asks the employer to type DELETE and offers closing instead.
function DeleteJobDialog({ job, open, onClose, onCloseInstead }: { job: Job; open: boolean; onClose: () => void; onCloseInstead: () => void }) {
  const [typed, setTyped] = useState('');
  const dialog = useModal(open, () => { setTyped(''); onClose(); });
  const router = useRouter();
  const [status, setStatus] = useState({ busy: false, error: '' });

  async function remove() {
    setStatus({ busy: true, error: '' });
    try {
      await api(`/jobs/${job.id}`, { method: 'DELETE' });
      router.push('/dashboard');
    } catch (err) {
      setStatus({ busy: false, error: (err as Error).message });
    }
  }

  return (
    <dialog ref={dialog} onClose={() => { setTyped(''); onClose(); }} aria-labelledby="delete-job-title"
      onClick={(e) => { if (e.target === dialog.current) onClose(); }} className={modalClass}>
      <div className="space-y-4 p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
          </span>
          <div>
            <h2 id="delete-job-title" className="text-lg font-bold text-slate-900">Delete this job permanently?</h2>
            <p className="mt-1 text-sm text-slate-600">&quot;{job.title}&quot;</p>
          </div>
        </div>
        <div className="space-y-2 rounded-xl bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">This can&apos;t be undone. Deleting will:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Remove the job post from your records for good</li>
            <li>Delete every application, cover letter and Smart Score for it</li>
            <li>Remove it from your past jobs, so you can&apos;t look back at who applied or who you hired</li>
          </ul>
          <p>Your messages with applicants are kept.</p>
        </div>
        {!job.closed_at && (
          <p className="text-sm text-slate-600">
            Just want to stop getting applications?{' '}
            <button type="button" onClick={onCloseInstead} className="font-semibold text-emerald-800 underline-offset-2 hover:underline">Close the job instead</button>
            {' '}and keep its history.
          </p>
        )}
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-slate-700">Type <strong className="font-mono">DELETE</strong> to confirm</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20" />
        </label>
        <ErrorText msg={status.error} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="button" onClick={remove} disabled={typed !== 'DELETE' || status.busy}
            className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40">
            {status.busy ? 'Deleting…' : 'Delete job forever'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
