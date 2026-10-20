'use client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { api, useApi, type Worker } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { LoadError, Initials, BackButton, ErrorText, band, buttonGhost, buttonGold, card } from '@/components/ui';
import { ENGLISH, SETUP, START_WHEN, WORK_HOURS, labelOf } from '@/lib/profile';
import { EmployerGate } from '@/components/EmployerGate';
import { JOB_TYPES } from '@/components/Select';
import { MaskedText, SaveButton, lastActive, rateLine } from '@/components/Talent';
import { useModal } from '@/components/useModal';

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

function Tile({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <section className={`${card} space-y-2 p-5 ${wide ? 'md:col-span-2' : ''}`}>
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</h2>
      {children}
    </section>
  );
}

// The worker's CV. The server decides: employers who can message the worker get the file, others are
// asked to upgrade (CVs usually carry contact details).
function ResumeButton({ workerId, limited, onUpgrade }: { workerId: number; limited: boolean; onUpgrade: () => void }) {
  const [error, setError] = useState('');
  if (limited) return <button type="button" onClick={onUpgrade} className={`${buttonGhost} w-full gap-2`}>📄 Download CV</button>;
  async function open() {
    setError('');
    const tab = window.open('', '_blank'); // opened on the click, so popup blockers allow it
    try {
      const { url } = await api<{ url: string }>(`/workers/${workerId}/resume`, { quiet: true });
      if (tab) tab.location.href = url; else window.location.href = url;
    } catch (err) {
      tab?.close();
      setError((err as Error).message);
    }
  }
  return (
    <div className="space-y-1">
      <button type="button" onClick={open} className={`${buttonGhost} w-full gap-2`}>📄 Download CV</button>
      <ErrorText msg={error} />
    </div>
  );
}

// Free employers see the same buttons as everyone; clicking one explains the plan limit and offers the way forward.
function UpgradeModal({ open, onClose, first, goal }: { open: boolean; onClose: () => void; first: string; goal: string }) {
  const dialog = useModal(open, onClose);
  const plans: [string, string][] = [
    ['Pro', 'Message any worker first, see your top 150 applicants per job, 500 AI fit scores a month'],
    ['Premium', 'Everything in Pro, plus every applicant, unlimited AI fit scores and your hiring analytics'],
  ];
  return (
    <dialog ref={dialog} onClose={onClose} aria-labelledby="upgrade-title"
      onClick={(e) => { if (e.target === dialog.current) onClose(); }}
      className="mx-auto mt-[12vh] w-[min(30rem,calc(100vw-2rem))] rounded-2xl p-0 shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm">
      <div className="space-y-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-100 text-xl" aria-hidden="true">🔒</span>
            <h2 id="upgrade-title" className="pt-2 font-display text-xl font-bold text-slate-900">Upgrade to {goal}</h2>
            <p className="text-sm text-slate-600">
              On the Free plan you can message workers who applied to your jobs. To reach out to {first} first, and see their full
              name, links and CV, move to <strong>Pro</strong> or <strong>Premium</strong>.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" /></svg>
          </button>
        </div>
        <ul className="space-y-2">
          {plans.map(([name, text]) => (
            <li key={name} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">
              <p className="font-semibold text-slate-900">{name}</p>
              <p className="text-slate-600">{text}</p>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500">Keeping outreach to paid plans keeps spammers and fake job offers away from workers.</p>
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Link href="/pricing" className={`${buttonGold} flex-1`}>See plans &amp; prices</Link>
          <Link href="/jobs/new" className={`${buttonGhost} flex-1`}>Post a job instead</Link>
        </div>
      </div>
    </dialog>
  );
}

export default function WorkerPage() {
  const { id } = useParams<{ id: string }>();
  const { user, ready } = useAuth();
  const allowed = user?.role === 'employer' || user?.id === Number(id); // workers can preview their own profile
  const { data, error, status, reload } = useApi<Worker>(allowed ? `/workers/${id}` : null);
  const [hiredAt, setHiredAt] = useState<string | null | undefined>(undefined); // after Mark as hired / Undo
  const [upgrade, setUpgrade] = useState(''); // what a Free employer tried to do, shown in the upgrade modal
  const employer = user?.role === 'employer';

  if (ready && !allowed) return <EmployerGate signedIn={!!user} />;
  if (error && !data) return <LoadError msg={error} status={status} onRetry={reload} back={['/workers', 'Browse talent']} />;
  if (!data) return <p className="text-slate-500">Loading…</p>;
  const w = { ...data, hired_at: hiredAt === undefined ? data.hired_at : hiredAt };
  const first = w.name.split(' ')[0];
  const rate = rateLine(w.hourly_rate);

  return (
    <div className="space-y-6">
      {user?.role === 'employer'
        ? <BackButton href="/workers">All talent</BackButton>
        : (
          // A worker previewing their own profile: back to editing, and a note on who sees this page.
          <div className="flex flex-wrap items-center justify-between gap-3">
            <BackButton href="/profile">Edit profile</BackButton>
            <p className="rounded-full bg-emerald-50 px-4 py-2 text-sm text-emerald-900 ring-1 ring-emerald-600/15">👀 This is how employers see your profile</p>
          </div>
        )}
      <section className={`${band} space-y-5 px-6 py-7 sm:px-8`}>
        <div className="flex flex-wrap items-center gap-5">
          <Initials name={w.name} id={w.id} size="h-20 w-20 text-2xl ring-4 ring-white/15" />
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-3 font-display text-3xl font-bold tracking-tight">{w.name}
              {w.deactivated && <span className="rounded-full bg-white/15 px-3 py-1 font-sans text-xs font-semibold text-emerald-100">Deactivated · not taking messages</span>}</h1>
            <p className="text-lg text-emerald-100">{w.title ? <MaskedText text={w.title} /> : 'No title yet'}</p>
            <p className="mt-1 text-sm text-emerald-200/80">
              {w.location && <>📍 <MaskedText text={w.location} /> · </>}{lastActive(w.last_seen_at)} · Member since {longDate(w.member_since)}
            </p>
          </div>
        </div>
        {employer && (w.limited ? (
          // A Free employer this worker hasn't applied to or talked with: say how to reach them, not a dead-end chat.
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setUpgrade(`message ${first}`)} className={buttonGold}>Message {first}</button>
            <Link href="/jobs/new" className="text-sm font-medium text-emerald-100 hover:text-white hover:underline">Or post a job and invite them to apply</Link>
            <div className="ml-auto w-36"><SaveButton workerId={w.id} saved={w.saved} /></div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 [&>*]:min-w-36">
            <Link href={`/messages?with=${w.id}`} className={buttonGold}>Message {first}</Link>
            <SaveButton workerId={w.id} saved={w.saved} />
            <HireButton worker={w} onChange={setHiredAt} />
          </div>
        ))}
      </section>

      {w.limited && (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-950">On the Free plan you can message workers who applied to your jobs. You&apos;ll see {first}&apos;s full name, links and resume once you can message them.</p>
      )}

      {/* Bento: one tile per topic, the facts employers check first at the top. Empty tiles are left out. */}
      <div className="grid grid-flow-dense gap-4 md:grid-cols-3">
        {rate && (
          <Tile label="Rate">
            <p className="font-display text-3xl font-bold text-emerald-700">{rate.hourly}</p>
            <p className="text-sm text-slate-500">{[JOB_TYPES.find((t) => t.value === w.availability)?.label, w.hours_per_week && `${w.hours_per_week} hrs/week`].filter(Boolean).join(' · ')}</p>
          </Tile>
        )}
        {(w.location || w.work_hours) && (
          <Tile label="Location & hours">
            {w.location && <p className="font-semibold">📍 <MaskedText text={w.location} /></p>}
            {w.work_hours && <p className="text-sm text-slate-500">Works {labelOf(WORK_HOURS, w.work_hours)?.toLowerCase()}</p>}
          </Tile>
        )}
        {(w.english || w.languages) && (
          <Tile label="Languages">
            {w.english && <p className="font-semibold">English: {labelOf(ENGLISH, w.english)}</p>}
            {w.languages && <p className="text-sm text-slate-500">Also speaks <MaskedText text={w.languages} /></p>}
          </Tile>
        )}
        {w.skills.length > 0 && (
          <Tile label="Skills" wide>
            <ul className="grid gap-2">
              {w.skills.map((s) => {
                const years = w.skill_years?.[s];
                return (
                  <li key={s} className="grid grid-cols-[minmax(0,1fr)_7rem_3.5rem] items-center gap-3 text-sm">
                    <span className="truncate font-medium capitalize">{s}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-emerald-50" aria-hidden="true">
                      {years != null && <span className="block h-full rounded-full bg-emerald-600" style={{ width: `${Math.min(100, (years / 8) * 100)}%` }} />}
                    </span>
                    <span className="text-right tabular-nums text-slate-500">{years != null ? `${years} yr${years === 1 ? '' : 's'}` : ''}</span>
                  </li>
                );
              })}
            </ul>
          </Tile>
        )}
        {(w.internet_mbps || w.setup?.length > 0) && (
          <Tile label="Work setup">
            <ul className="space-y-1 text-sm">
              {w.internet_mbps && <li>🌐 {w.internet_mbps} Mbps internet</li>}
              {w.setup.map((x) => <li key={x}>✓ {labelOf(SETUP, x)}</li>)}
            </ul>
          </Tile>
        )}
        <Tile label="About" wide>
          <p className="whitespace-pre-line text-slate-700">{w.bio ? <MaskedText text={w.bio} /> : 'This professional hasn’t written a bio yet.'}</p>
        </Tile>
        {w.start_when && (
          <Tile label="Can start">
            <p className="font-semibold">{labelOf(START_WHEN, w.start_when)}</p>
            <p className="text-sm text-slate-500">{lastActive(w.last_seen_at)}</p>
          </Tile>
        )}
        {(w.has_resume || w.portfolio_url || w.linkedin_url || w.limited) && (
          <Tile label="Resume & links">
            {w.has_resume && <ResumeButton workerId={w.id} limited={!!w.limited} onUpgrade={() => setUpgrade(`see ${first}’s CV`)} />}
            {/* Worker-supplied links: open in a new tab, no referrer, no SEO credit. */}
            {[[w.portfolio_url, 'Sample work / portfolio'], [w.linkedin_url, 'LinkedIn profile']].map(([href, label]) => href && (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer nofollow" className="block text-sm font-medium text-emerald-700 hover:underline">🔗 {label} ↗</a>
            ))}
            {w.limited && <p className="text-xs text-slate-500">Links are hidden until you can message {first}.</p>}
          </Tile>
        )}
      </div>
      {w.limited && <UpgradeModal open={!!upgrade} onClose={() => setUpgrade('')} first={first} goal={upgrade} />}
    </div>
  );
}
