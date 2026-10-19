'use client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { api, useApi, type Worker } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Skills, LoadError, Initials, BackButton, ErrorText, button, card } from '@/components/ui';
import { EmployerGate } from '@/components/EmployerGate';
import { JOB_TYPES } from '@/components/Select';
import { MaskedText, SaveButton, lastActive, rateLine } from '@/components/Talent';

const longDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '-');

// Mark as hired: records that this employer hired the worker (it powers "Your hires", and reviews later).
// Undo is one click, in case it was a mistake.
function HireButton({ worker, onChange }: { worker: Worker; onChange: (hiredAt: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function toggle() {
    setBusy(true); setError('');
    try {
      await api(`/hires/${worker.id}`, { method: worker.hired_at ? 'DELETE' : 'PUT', quiet: true });
      onChange(worker.hired_at ? null : new Date().toISOString());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-1">
      {worker.hired_at ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <span><strong>Hired</strong> · {longDate(worker.hired_at)}</span>
          <button type="button" onClick={toggle} disabled={busy} className="text-xs font-semibold text-emerald-800 hover:underline">Undo</button>
        </div>
      ) : (
        <button type="button" onClick={toggle} disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-600 hover:text-emerald-800 disabled:opacity-60">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6m7 1 2 2 4-4" /></svg>
          {busy ? 'Saving…' : 'Mark as hired'}
        </button>
      )}
      <ErrorText msg={error} />
    </div>
  );
}

export default function WorkerPage() {
  const { id } = useParams<{ id: string }>();
  const { user, ready } = useAuth();
  const allowed = user?.role === 'employer' || user?.id === Number(id); // workers can preview their own profile
  const { data, error, status, reload } = useApi<Worker>(allowed ? `/workers/${id}` : null);
  const [hiredAt, setHiredAt] = useState<string | null | undefined>(undefined); // after Mark as hired / Undo
  const employer = user?.role === 'employer';

  if (ready && !allowed) return <EmployerGate signedIn={!!user} />;
  if (error && !data) return <LoadError msg={error} status={status} onRetry={reload} back={['/workers', 'Browse talent']} />;
  if (!data) return <p className="text-slate-500">Loading…</p>;
  const w = { ...data, hired_at: hiredAt === undefined ? data.hired_at : hiredAt };
  const first = w.name.split(' ')[0];
  const rate = rateLine(w.hourly_rate, w.availability);

  return (
    <div className="space-y-6">
      <BackButton href="/workers">All talent</BackButton>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="space-y-6">
          <div className={`${card} flex flex-wrap items-center gap-5`}>
            <Initials name={w.name} id={w.id} size="h-20 w-20 text-2xl" />
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold">{w.name}</h1>
              <p className="text-lg text-slate-600">{w.title ? <MaskedText text={w.title} /> : 'No title yet'}</p>
              <p className="mt-1 text-sm text-slate-500">{lastActive(w.last_seen_at)} · Member since {longDate(w.member_since)}</p>
            </div>
          </div>
          <section className={card}>
            <h2 className="mb-3 font-semibold">About</h2>
            <p className="whitespace-pre-line text-slate-700">{w.bio ? <MaskedText text={w.bio} /> : 'This professional hasn’t written a bio yet.'}</p>
          </section>
        </div>

        <aside className={`${card} h-fit space-y-5`}>
          {employer && (
            <div className="space-y-2">
              {/* "limited": a Free employer this worker hasn't applied to or talked with. They can't message
                  first, and see "Maria S." without links, so say how to change that instead of a dead-end chat. */}
              {w.limited ? (
                <div className="space-y-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">
                  <p>On the Free plan you can message workers who applied to your jobs. You&apos;ll also see {first}&apos;s full name and links once you can message them.</p>
                  <Link href="/pricing" className="block rounded-lg bg-amber-400 px-4 py-2 text-center font-semibold text-slate-900 hover:bg-amber-300">Upgrade to message {first}</Link>
                  <Link href="/jobs/new" className="block text-center font-medium text-amber-900 hover:underline">Or post a job and invite them to apply</Link>
                </div>
              ) : (
                <Link href={`/messages?with=${w.id}`} className={`${button} w-full`}>Message {first}</Link>
              )}
              <div className="flex gap-2 [&>*]:flex-1">
                <SaveButton workerId={w.id} saved={w.saved} />
              </div>
              {!w.limited && <HireButton worker={w} onChange={setHiredAt} />}
            </div>
          )}
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Looking for</h2>
            <p className="mt-1 font-medium">{JOB_TYPES.find((t) => t.value === w.availability)?.label ?? w.availability} work</p>
          </div>
          {rate && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rate</h2>
              <p className="mt-1 text-xl font-bold text-emerald-700">{rate.hourly}</p>
              {rate.monthly && <p className="text-sm text-slate-500">{rate.monthly}</p>}
            </div>
          )}
          {w.skills.length > 0 && (
            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Skills</h2>
              <Skills skills={w.skills} />
            </div>
          )}
          {(w.portfolio_url || w.linkedin_url) && (
            <div className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Links</h2>
              {/* Worker-supplied links: open in a new tab, no referrer, no SEO credit. */}
              {[[w.portfolio_url, 'Sample work / portfolio'], [w.linkedin_url, 'LinkedIn profile']].map(([href, label]) => href && (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer nofollow"
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-emerald-600 hover:text-emerald-800">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-emerald-700" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <span className="text-xs text-slate-400" aria-hidden="true">↗</span>
                </a>
              ))}
            </div>
          )}
          {w.limited && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">Links and contact details are hidden until you can message {first}.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
