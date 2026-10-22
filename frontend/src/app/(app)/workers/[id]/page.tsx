'use client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Fragment, useState } from 'react';
import { api, useApi, type Worker } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { LoadError, Initials, BackButton, ErrorText, buttonGhost, buttonGold, card } from '@/components/ui';
import { ENGLISH, GENDERS, SETUP, START_WHEN, WORK_HOURS, labelOf } from '@/lib/profile';
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
    <div className={`space-y-1 ${worker.hired_at ? 'col-span-2' : ''}`}>
      {worker.hired_at ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <span><strong>Hired</strong> · {longDate(worker.hired_at)}</span>
          <button type="button" onClick={toggle} disabled={busy} className="!w-auto !p-0 text-xs font-semibold text-emerald-800 hover:underline">Undo</button>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={`${card} space-y-2.5 !p-5`}>
      <h2 className="text-sm font-bold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

const seenThisWeek = (iso?: string | null) => !!iso && Date.now() - Date.parse(iso) < 7 * 864e5;

// What an employer can check at a glance. Only the email is confirmed by us; the rest is what the worker filled in.
function TrustChecks({ w }: { w: Worker }) {
  const filled = [w.title, w.bio, w.skills.length, w.hourly_rate, w.english, w.work_hours, w.start_when, w.internet_mbps, w.setup?.length, w.location].filter(Boolean).length;
  const checks: [string, boolean, string, string][] = [
    ['Email', !!w.email_verified, 'Verified', 'Not verified'],
    ['Active in the last week', seenThisWeek(w.last_seen_at), 'Yes', 'No'],
    ['Profile filled in', filled >= 7, `${filled} of 10`, `${filled} of 10`],
    ['Photo', !!w.has_photo, 'Added', 'Not added'],
    ['Resume', w.has_resume, 'Shared', 'Not added'],
    ['Portfolio or LinkedIn', !!w.has_links, 'Added', 'Not added'],
  ];
  const passed = checks.filter((c) => c[1]).length;
  return (
    <section className={`${card} space-y-2.5 !p-4`}>
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-slate-900">Trust checks</h2>
        <span className={`text-xs font-semibold ${passed >= 5 ? 'text-emerald-700' : 'text-amber-800'}`}>{passed} of {checks.length}</span>
      </div>
      <div className="grid grid-cols-6 gap-1" aria-hidden="true">
        {checks.map(([label, ok]) => <span key={label} className={`h-1.5 rounded-full ${ok ? 'bg-emerald-600' : 'bg-slate-200'}`} />)}
      </div>
      <ul className="space-y-1.5 text-[13px]">
        {checks.map(([label, ok, yes, no]) => (
          <li key={label} className="flex justify-between gap-3">
            <span className="text-slate-700">{label}</span>
            <span className={ok ? 'font-semibold text-emerald-700' : 'text-slate-400'}>{ok ? `✓ ${yes}` : no}</span>
          </li>
        ))}
      </ul>
      <p className="border-t border-slate-100 pt-2 text-[11px] text-slate-500">We confirm the email. The rest is what the worker filled in.</p>
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
    ['Pro', 'Message any worker first, see the first 100 applicants per job, Smart Matching, 500 Smart Scores a month'],
    ['Premium', 'Everything in Pro, plus every applicant, 30 Smart Matching shortlists a month, unlimited Smart Scores and your hiring analytics'],
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

  const job = JOB_TYPES.find((t) => t.value === w.availability)?.label;
  const details: [string, React.ReactNode][] = [
    ['Hours', w.work_hours && `Works ${labelOf(WORK_HOURS, w.work_hours)?.toLowerCase()}${w.hours_per_week ? ` · ${w.hours_per_week} hrs/week` : ''}`],
    ['Location', w.location && <MaskedText text={w.location} />],
    ['Languages', (w.english || w.languages) && <>{w.english && `English: ${labelOf(ENGLISH, w.english)}`}{w.english && w.languages && ' · '}{w.languages && <MaskedText text={w.languages} />}</>],
    ['Can start', w.start_when && labelOf(START_WHEN, w.start_when)],
    ['Internet speed', w.internet_mbps && `${w.internet_mbps} Mbps`],
    ['Home setup', w.setup?.length > 0 && w.setup.map((x) => labelOf(SETUP, x)).join(' · ')],
    ['Age and gender', [w.age && `${w.age} years old`, w.gender !== 'unsaid' && labelOf(GENDERS, w.gender)].filter(Boolean).join(' · ')],
    ['Member since', longDate(w.member_since)],
  ];

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside className="space-y-3 lg:sticky lg:top-20">
        {employer
          ? <BackButton href="/workers">All talent</BackButton>
          : <BackButton href="/profile">Edit profile</BackButton>}
        {!employer && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-900 ring-1 ring-emerald-600/15">This is how employers see your profile.</p>}
        <section className={`${card} flex flex-col items-center gap-1 !p-5 text-center`}>
          <Initials name={w.name} id={w.id} size="h-[72px] w-[72px] text-xl" />
          <h1 className="mt-1 flex items-center gap-2 font-display text-lg font-bold text-slate-900">{w.name}
            {w.name_hidden && (
              <button type="button" onClick={() => setUpgrade(`see ${first}’s full name`)} title="You can’t see full names or message workers on the Free plan"
                className="grid h-5 w-5 place-items-center rounded-full font-sans text-xs font-semibold text-slate-500 ring-1 ring-slate-300 hover:bg-slate-100" aria-label="Why is the name short?">?</button>
            )}</h1>
          <p className="text-sm text-slate-600">{w.title ? <MaskedText text={w.title} /> : 'No title yet'}</p>
          <p className="text-xs text-slate-500">{lastActive(w.last_seen_at)}</p>
          {w.deactivated && <p className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">Deactivated · not taking messages</p>}
          {rate && (
            <p className="mt-1 font-display text-xl font-bold text-emerald-700">{rate.hourly.replace('/hr', '')}
              <span className="font-sans text-xs font-medium text-slate-500">/hr{job && ` · ${job}`}</span></p>
          )}
          {employer && (
            <div className="mt-2 w-full space-y-1.5 [&_button]:w-full [&_button]:justify-center [&_button]:rounded-full [&_button]:px-3 [&_button]:py-1.5 [&_button]:text-[13px]">
              {w.limited
                ? <button type="button" onClick={() => setUpgrade(`message ${first}`)} className={buttonGold}>Message {first}</button>
                : <Link href={`/messages?with=${w.id}`} className={`${buttonGold} w-full !py-2`}>Message {first}</Link>}
              <div className={w.limited ? '' : 'grid grid-cols-2 gap-1.5'}>
                <SaveButton workerId={w.id} saved={w.saved} compact />
                {!w.limited && <HireButton worker={w} onChange={setHiredAt} />}
              </div>
              {w.limited && <Link href="/jobs/new" className="block pt-1 text-xs font-medium text-emerald-700 hover:underline">Or post a job and invite them to apply</Link>}
            </div>
          )}
        </section>
        <TrustChecks w={w} />
      </aside>

      <main className="space-y-3 lg:pt-11">
        {w.limited && (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-950">On the Free plan you can message workers who applied to your jobs. You&apos;ll see {w.name_hidden && <>{first}&apos;s full name, </>}links and resume once you can message them.</p>
        )}
        <Section title="About">
          <p className="whitespace-pre-line text-sm text-slate-700">{w.bio ? <MaskedText text={w.bio} /> : 'This professional hasn’t written a bio yet.'}</p>
        </Section>
        {w.skills.length > 0 && (
          <Section title="Skills">
            <ul className="grid gap-2">
              {w.skills.map((s) => {
                const years = w.skill_years?.[s];
                return (
                  <li key={s} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm">
                    <span className="truncate capitalize">{s}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-emerald-50" aria-hidden="true">
                      {years != null && <span className="block h-full rounded-full bg-emerald-600" style={{ width: `${Math.min(100, (years / 10) * 100)}%` }} />}
                    </span>
                    <span className="text-right tabular-nums text-slate-500">{years != null ? `${years} yr${years === 1 ? '' : 's'}` : ''}</span>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}
        <Section title="Work details">
          <dl className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
            {details.map(([label, value]) => (
              <Fragment key={label}>
                <dt className="text-slate-500">{label}</dt>
                <dd className={value ? 'text-slate-800' : 'text-slate-400'}>{value || 'Not added'}</dd>
              </Fragment>
            ))}
          </dl>
        </Section>
        {(w.has_resume || w.has_links) && (
          <Section title="Resume and links">
            <div className="flex flex-wrap items-center gap-3 [&_button]:w-auto [&_button]:px-4 [&_button]:py-1.5">
              {w.has_resume && <ResumeButton workerId={w.id} limited={!!w.limited} onUpgrade={() => setUpgrade(`see ${first}’s CV`)} />}
              {/* Worker-supplied links: open in a new tab, no referrer, no SEO credit. */}
              {[[w.portfolio_url, 'Sample work / portfolio'], [w.linkedin_url, 'LinkedIn profile']].map(([href, label]) => href && (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-sm font-medium text-emerald-700 hover:underline">🔗 {label} ↗</a>
              ))}
            </div>
            {w.limited && w.has_links && <p className="text-xs text-slate-500">Links are hidden until you can message {first}.</p>}
          </Section>
        )}
      </main>
      {w.limited && <UpgradeModal open={!!upgrade} onClose={() => setUpgrade('')} first={first} goal={upgrade} />}
    </div>
  );
}
