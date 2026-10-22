'use client';
import Link from 'next/link';
import { Select } from '@/components/Select';
import { card } from '@/components/styles';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, useApi, salary, interest, type Job } from '@/lib/api';
import { Skills, ErrorText, Initials, Interest, CREDITS_INFO, SMART_SCORE_INFO, TimeAgo, ScoreDonut as Donut, scoreBand as band } from '@/components/ui';
import { ResumeModal, type ViewableResume } from '@/components/ResumeModal';
import { BulkMessage } from '@/components/BulkMessage';

type Analysis = { score: number; verdict: string; strengths: string[]; concerns: string[]; resume?: 'read' | 'unreadable' | 'none' };
type Plan = 'free' | 'pro' | 'premium';
type Usage = { plan: Plan; used: number; limit: number | null; remaining: number | null };
type ApplicantList = { applicants: Applicant[]; total: number; limit: number | null; plan: Plan };
const PLAN_NAME = { free: 'Free', pro: 'Pro', premium: 'Premium' };
type Applicant = {
  id: number; worker_id: number; name: string; email: string; title: string | null; skills: string[] | null;
  cover_letter: string; credits: number; created_at: string; analysis: Analysis | null; resume_name: string | null;
  deleted?: boolean; deactivated?: boolean; hourly_rate: string | null; messaged: boolean; hired: boolean; saved: boolean;
};


// A small card that opens under its trigger on hover or keyboard focus (e.g. explaining Get score).
function HoverCard({ id, icon, title, children, trigger }: { id: string; icon: string; title: string; children: React.ReactNode; trigger: React.ReactNode }) {
  return (
    <span className="group relative inline-block">
      {trigger}
      <span id={id} role="tooltip"
        className="invisible absolute right-0 top-full z-30 mt-2.5 w-72 before:absolute before:inset-x-0 before:-top-3 before:h-3 before:content-[''] translate-y-1 rounded-xl bg-white p-4 text-left text-xs leading-relaxed text-slate-600 opacity-0 shadow-xl shadow-slate-900/10 ring-1 ring-slate-200 transition group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
        <span aria-hidden="true" className="absolute -top-1.5 right-8 h-3 w-3 rotate-45 bg-white ring-1 ring-slate-200 [clip-path:polygon(0_0,100%_0,0_100%)]" />
        <span className="mb-1.5 flex items-center gap-2 font-semibold text-slate-900">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-amber-100 text-amber-700" aria-hidden="true">{icon}</span>{title}
        </span>
        {children}
      </span>
    </span>
  );
}

// An ⓘ (after an optional label) that opens the same white card as Get score.
function InfoCard({ id, icon, title, label, children }: { id: string; icon: string; title: string; label?: string; children: React.ReactNode }) {
  return (
    <span className="whitespace-normal font-normal normal-case tracking-normal">
      <HoverCard id={id} icon={icon} title={title} trigger={
        <span tabIndex={0} aria-describedby={id} className="inline-flex cursor-help items-center gap-1.5 align-middle outline-none">
          {label && <span className="font-semibold uppercase tracking-wide">{label}</span>}
          <span aria-hidden="true" className="grid h-4 w-4 place-items-center rounded-full text-[10px] font-bold text-slate-500 ring-1 ring-slate-300">i</span>
        </span>}>
        {children}
      </HoverCard>
    </span>
  );
}

export default function Applicants() {
  const { id } = useParams<{ id: string }>();
  const { data: page, error } = useApi<ApplicantList>(`/jobs/${id}/applications`);
  const apps = page?.applicants;
  useEffect(() => { if (page) window.dispatchEvent(new Event('rp:applicants-seen')); }, [page]); // the server marked them seen: update the 🔔
  // Links like /dashboard/jobs/21#applicant-5 (from All applicants and the dashboard) open that person.
  useEffect(() => { const m = location.hash.match(/^#applicant-(\d+)$/); if (m) setSel(Number(m[1])); }, []);
  const hidden = page ? page.total - page.applicants.length : 0;
  const { data: job } = useApi<Job>(`/jobs/${id}`);
  const { data: initialUsage } = useApi<Usage>('/analyzer/usage');
  const [usage, setUsage] = useState<Usage | null>(null);
  const [results, setResults] = useState<Record<number, Analysis>>({});
  const [busy, setBusy] = useState<Record<number, boolean>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [sortBy, setSortBy] = useState<'credits' | 'newest' | 'score'>('credits');
  const [filter, setFilter] = useState<'all' | 'saved'>('all');
  const [savedNow, setSavedNow] = useState<Record<number, boolean>>({}); // bookmarks changed on this page, by worker id
  const u = usage ?? initialUsage;
  const [sel, setSel] = useState<number | null>(null); // the application open in the drawer
  const [picked, setPicked] = useState<Set<number>>(new Set()); // ticked applicants, for one message to all of them
  const [composing, setComposing] = useState(false);
  const [sentNote, setSentNote] = useState('');
  const [sentNow, setSentNow] = useState<Set<number>>(new Set()); // messaged from this page, until the next reload
  const outOfFree = u?.remaining === 0;

  async function analyze(appId: number, again = false) {
    setBusy((b) => ({ ...b, [appId]: true }));
    setErrors((e) => ({ ...e, [appId]: '' }));
    try {
      const res = await api<{ analysis: Analysis; usage: Usage }>(`/applications/${appId}/analyze`, { method: 'POST', body: { again } });
      setResults((r) => ({ ...r, [appId]: res.analysis }));
      setUsage(res.usage);
    } catch (err) {
      setErrors((e) => ({ ...e, [appId]: (err as Error).message }));
      api<Usage>('/analyzer/usage', { quiet: true }).then(setUsage, () => {});
    } finally {
      setBusy((b) => ({ ...b, [appId]: false }));
    }
  }

  // Get a fresh short-lived link and show the resume in the viewer.
  const [viewing, setViewing] = useState<ViewableResume | null>(null);
  async function openResume(appId: number, name: string) {
    try {
      const { url } = await api<{ url: string }>(`/applications/${appId}/resume`);
      setViewing({ name, url });
    } catch (err) {
      setErrors((e) => ({ ...e, [appId]: (err as Error).message }));
    }
  }

  // Premium: score every unscored applicant in one go, three at a time, stopping at the first problem.
  const [scoring, setScoring] = useState<{ done: number; of: number } | null>(null);
  const [scoreError, setScoreError] = useState('');
  const stop = useRef(false);
  async function scoreAll(ids: number[]) {
    setScoreError(''); stop.current = false;
    setScoring({ done: 0, of: ids.length });
    const queue = [...ids];
    const worker = async () => {
      for (let appId = queue.shift(); appId !== undefined && !stop.current; appId = queue.shift()) {
        try {
          const res = await api<{ analysis: Analysis; usage: Usage }>(`/applications/${appId}/analyze`, { method: 'POST', quiet: true });
          setResults((r) => ({ ...r, [appId]: res.analysis }));
          setUsage(res.usage);
          setScoring((s) => s && { ...s, done: s.done + 1 });
        } catch (err) {
          stop.current = true;
          setScoreError((err as Error).message);
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setScoring(null);
  }

  // Bookmark = the employer's Saved workers list, so strong people stay findable from Hire Talent too.
  const isSaved = (a: Applicant) => savedNow[a.worker_id] ?? a.saved;
  async function toggleSave(a: Applicant) {
    const next = !isSaved(a);
    setSavedNow((s) => ({ ...s, [a.worker_id]: next }));
    try {
      await api(`/saved/${a.worker_id}`, { method: next ? 'PUT' : 'DELETE', quiet: true });
    } catch (err) {
      setSavedNow((s) => ({ ...s, [a.worker_id]: !next }));
      setErrors((e) => ({ ...e, [a.id]: (err as Error).message }));
    }
  }

  const list = (apps ?? []).map((a) => ({ ...a, analysis: results[a.id] ?? a.analysis, messaged: a.messaged || sentNow.has(a.id) }));
  if (sortBy === 'score') list.sort((x, y) => (y.analysis?.score ?? -1) - (x.analysis?.score ?? -1));
  if (sortBy === 'newest') list.sort((x, y) => y.created_at.localeCompare(x.created_at));
  const savedCount = list.filter(isSaved).length;
  const shown = filter === 'saved' ? list.filter(isSaved) : list;
  const unscored = list.filter((a) => !a.analysis && !a.deleted).map((a) => a.id);
  const messageable = shown.filter((a) => !a.deleted && !a.deactivated);
  const allPicked = messageable.length > 0 && messageable.every((a) => picked.has(a.id));
  const togglePick = (appId: number) => setPicked((p) => { const n = new Set(p); if (n.has(appId)) n.delete(appId); else n.add(appId); return n; });
  const first = (name: string) => name.split(' ')[0];
  const outText = u?.limit === null
    ? 'You’ve reached this month’s fair-use limit of 10,000 Smart Scores. It resets on the 1st.'
    : `You’ve used all ${u?.limit ?? ''} Smart Scores on the ${PLAN_NAME[u?.plan ?? 'free']} plan this month. ${u?.plan === 'free' ? 'Upgrade to Pro for 500 a month, or Premium for unlimited.' : 'Upgrade to Premium for unlimited.'} Your scores also come back on the 1st.`;
  // Red notice inside the Smart Score cards once this month's scores are used up.
  const outNote = (
    <span className="mt-2.5 block rounded-lg bg-red-50 p-2.5 text-red-800 ring-1 ring-red-200">
      <b className="block text-red-900">You’re out of Smart Scores</b>
      {u?.limit === null ? outText : <>Upgrade your plan to get more Smart Scores this month. {u?.plan === 'free' ? 'Pro gives 500 a month, Premium is unlimited.' : 'Premium is unlimited.'} <Link href="/pricing" className="font-semibold underline">See plans</Link></>}
    </span>
  );
  const left = u && u.limit !== null ? (u.remaining ?? 0) / u.limit : 1; // share of this month's scores left
  const scoreTip = (name: string) => `Our AI reads ${first(name)}’s cover letter, profile and resume against your job post and scores the fit from 0 to 100, with strengths and concerns. Takes a few seconds${u?.limit === null ? '.' : ` and uses 1 of your ${u?.remaining ?? '…'} left this month.`}`;

  // The drawer: the open applicant, and moving up and down the list as it's shown (filter and sort applied).
  const idx = shown.findIndex((a) => a.id === sel);
  const current = list.find((a) => a.id === sel) ?? null;
  const lastShown = useRef<typeof current>(null); // keeps the drawer filled while it slides away
  if (current) lastShown.current = current;
  const person = current ?? lastShown.current;
  const move = (d: number) => { if (shown.length) setSel(shown[Math.min(shown.length - 1, Math.max(0, (idx < 0 ? 0 : idx) + d))].id); };
  useEffect(() => {
    if (sel === null) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]') || document.querySelector('dialog[open]')) return;
      if (e.key === 'Escape') setSel(null);
      else if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); move(-1); }
    };
    // A click outside the drawer closes it. Rows switch person instead, and open pop-ups (resume, message) don't count.
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('aside[aria-label="Applicant details"], tr[data-row], dialog')) setSel(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  });

  const scoreButton = (a: Applicant) => (outOfFree ? (
    <HoverCard id={`tip-${a.id}`} icon="🔒" title="No Smart Scores left" trigger={
      <Link href="/pricing" aria-describedby={`tip-${a.id}`} onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-full border border-amber-300 bg-amber-50 px-1.5 py-px text-[10px] font-medium text-amber-900 hover:bg-amber-100">
        <svg viewBox="0 0 24 24" className="h-2 w-2" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
        Upgrade to score
      </Link>}>
      {outNote}
    </HoverCard>
  ) : (
    <HoverCard id={`tip-${a.id}`} icon="✦" title="What is a Smart Score?" trigger={
      <button type="button" onClick={(e) => { e.stopPropagation(); analyze(a.id); }} disabled={busy[a.id] || !!scoring} aria-describedby={`tip-${a.id}`}
        className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-slate-400 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-emerald-600 disabled:opacity-60">
        {busy[a.id] ? <><span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent" aria-hidden="true" />Scoring…</> : <><span className="text-amber-600" aria-hidden="true">✦</span>Get score</>}
      </button>}>
      {scoreTip(a.name)}
    </HoverCard>
  ));

  const th = 'whitespace-nowrap px-2 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500';
  const pill = 'rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:ring-emerald-600';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/jobs" aria-label="Back to My Job Posts" title="Back to My Job Posts"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-slate-900 ring-1 ring-slate-200 hover:ring-emerald-600">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </Link>
        <div className="min-w-0 flex-1">
          <Link href="/dashboard/jobs" className="text-xs text-slate-500 hover:text-emerald-700 hover:underline">My Job Posts</Link>
          <h1 className="truncate text-xl font-bold text-slate-900">{job?.title ?? 'Applicants'}</h1>
          {job && <p className="text-xs text-slate-500">{job.closed_at ? 'Closed' : 'Open'} · {job.job_type[0].toUpperCase() + job.job_type.slice(1)} · {salary(job)}</p>}
        </div>
        <Link href={`/jobs/${id}?from=applicants`} className={pill}>View post</Link>
        <Link href={`/jobs/${id}/edit?from=applicants`} className={pill}>Edit</Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {([['Applied', page?.total], ['You messaged', page && list.filter((a) => a.messaged).length], ['Hired', page && list.filter((a) => a.hired).length]] as const).map(([label, value]) => (
          <div key={label} className="rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200/80">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-xl font-bold tabular-nums text-slate-900">{value ?? '…'}</p>
          </div>
        ))}
      </div>

      {hidden > 0 && page && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <p className="min-w-56 flex-1 text-amber-950"><b>{hidden} more applicant{hidden === 1 ? ' is' : 's are'} hidden.</b> The {PLAN_NAME[page.plan]} plan shows the first {page.limit} people who apply to each job.</p>
          <Link href="/pricing" className="rounded-lg bg-amber-400 px-3 py-1.5 font-semibold text-slate-900 hover:bg-amber-300">Unlock all applicants</Link>
        </div>
      )}
      {sentNote && <p className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-900" role="status">{sentNote}</p>}
      <ErrorText msg={error} />

      <section className={`${card} p-0`}>{/* not tableCard: its overflow-hidden would cut off the Get score card */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-100 px-4 py-2.5">
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs" role="group" aria-label="Show">
            {([['all', `All ${list.length}`], ['saved', `★ Bookmarked ${savedCount}`]] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k}
                className={`rounded-md px-3 py-1.5 font-semibold transition ${filter === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{label}</button>
            ))}
          </div>
          {/* Always there, grey until someone is ticked; the count goes up as people are ticked. */}
          <button type="button" onClick={() => setComposing(true)} disabled={!picked.size}
            title={picked.size ? undefined : 'Tick applicants in the list to message them all at once'}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v11H8l-4 4z" /></svg>
            Message{picked.size > 0 && <span className="rounded-full bg-white/20 px-1.5 tabular-nums">{picked.size}</span>}
          </button>
          {picked.size > 0
            ? <button type="button" onClick={() => setPicked(new Set())} className="text-xs text-slate-500 hover:text-slate-800">Clear</button>
            : messageable.length > 1 && <span className="text-xs text-slate-400">Tick people to message them together</span>}
          <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-slate-500">
            {u && (
              // How many Smart Scores are left: green while plenty, amber when running low, red with Upgrade at zero.
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 ring-1 ${outOfFree ? 'bg-red-50 text-red-900 ring-red-200' : left <= 0.4 ? 'bg-amber-50 text-amber-900 ring-amber-200' : 'bg-emerald-50 text-emerald-900 ring-emerald-200'}`}>
                <span aria-hidden="true">✦</span>
                {u.limit === null ? <b>Unlimited Smart Scores</b> : <span><b className="text-sm tabular-nums">{u.remaining}</b> of {u.limit} Smart Scores left</span>}
                {u.limit !== null && (
                  <span className="h-1.5 w-12 overflow-hidden rounded-full bg-white/80" aria-hidden="true">
                    <span className={`block h-full rounded-full ${outOfFree ? 'bg-red-500' : left <= 0.4 ? 'bg-amber-500' : 'bg-emerald-600'}`} style={{ width: `${left * 100}%` }} />
                  </span>
                )}
                {outOfFree && u.limit !== null && <Link href="/pricing" className="font-semibold underline">Upgrade</Link>}
                <InfoCard id="tip-left" icon="✦" title="Smart Score">{SMART_SCORE_INFO}{outOfFree && outNote}</InfoCard>
              </span>
            )}
            {scoring && <span className="font-medium text-emerald-800" role="status">Scoring {scoring.done} of {scoring.of}…</span>}
            {u?.plan === 'premium' ? (
              unscored.length > 0 && (scoring
                ? <button type="button" onClick={() => { stop.current = true; }} className="rounded-lg px-2.5 py-1 font-semibold text-slate-700 ring-1 ring-slate-200">Stop</button>
                : <button type="button" onClick={() => scoreAll(unscored)} className="rounded-lg px-2.5 py-1 font-semibold text-slate-700 ring-1 ring-slate-200 hover:ring-emerald-600">Score all {unscored.length}</button>)
            ) : (
              <Link href="/pricing" title="Score every applicant in one click with Premium" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold text-slate-700 ring-1 ring-slate-200 hover:ring-emerald-600">
                Score all <span className="rounded bg-slate-100 px-1.5 text-[10px] text-slate-600">Premium</span>
              </Link>
            )}
            <Select label="Sort" className="w-52" value={sortBy} onChange={(v) => setSortBy(v as typeof sortBy)}
              options={[{ value: 'credits', label: 'Most interested' }, { value: 'newest', label: 'Newest' }, { value: 'score', label: 'Highest Smart Score' }]} />
          </div>
        </div>
        <ErrorText msg={scoreError} />

        {page?.total === 0 ? <p className="p-6 text-center text-slate-500">No applicants yet. They&apos;ll appear here as workers apply.</p> : (
          // Scrolls sideways only on small screens; on wide ones nothing is clipped, so the Get score card shows whole.
          <div className="min-h-80 overflow-x-auto lg:overflow-visible">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-slate-200">
                <tr>
                  <th className="w-10 px-4 py-3">{messageable.length > 1 && <input type="checkbox" aria-label="Select everyone shown" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(messageable.map((a) => a.id)))} className="h-4 w-4 accent-emerald-700" />}</th>
                  <th className={th}>Applicant</th>
                  <th className={th}>Cover letter</th>
                  <th className={th}>Rate</th>
                  <th className={th}><InfoCard id="tip-interest" icon="⚡" title="Interest" label="Interest">{CREDITS_INFO}</InfoCard></th>
                  <th className={th}><InfoCard id="tip-score" icon="✦" title="Smart Score" label="Smart Score">{SMART_SCORE_INFO}{outOfFree && outNote}</InfoCard></th>
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!page && !error && <tr><td colSpan={7} className="p-6 text-center text-slate-500">Loading…</td></tr>}
                {page && !shown.length && <tr><td colSpan={7} className="p-8 text-center text-slate-500">No bookmarked applicants yet. Open someone and click <b>☆ Bookmark</b> to keep them here.</td></tr>}
                {shown.map((a) => {
                  const b = a.analysis && band(a.analysis.score);
                  const isSel = a.id === sel;
                  return (
                    <tr key={a.id} data-row onClick={() => setSel(a.id)} className={`cursor-pointer align-middle transition-colors ${isSel ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>{!a.deleted && !a.deactivated && messageable.length > 1 && <input type="checkbox" aria-label={`Select ${a.name}`} checked={picked.has(a.id)} onChange={() => togglePick(a.id)} className="h-4 w-4 accent-emerald-700" />}</td>
                      <td className="min-w-44 px-2 py-3">
                        <button type="button" onClick={(e) => { e.stopPropagation(); setSel(a.id); }} className="text-left font-semibold text-slate-900 hover:text-emerald-800 hover:underline">
                          {a.deleted ? 'Deleted account' : a.name}{isSaved(a) && <span className="ml-1.5 text-amber-500" title="Bookmarked">★</span>}
                        </button>
                        <span className="block text-xs text-slate-500">{a.deactivated ? 'Paused · not taking messages' : a.title || 'No title'}</span>
                        <span className="block text-xs text-emerald-800"><TimeAgo date={a.created_at} />{a.hired ? ' · Hired' : ''}</span>
                      </td>
                      <td className="max-w-sm px-2 py-3 text-xs leading-relaxed text-slate-600"><span className="line-clamp-2">{a.cover_letter}</span></td>
                      <td className="whitespace-nowrap px-2 py-3">
                        {a.hourly_rate
                          ? <span className="font-semibold tabular-nums text-slate-900">${Number(a.hourly_rate)}<span className="text-xs font-normal text-slate-500">/hr</span></span>
                          : <span className="text-slate-400">-</span>}
                      </td>
                      <td className="px-2 py-3"><Interest credits={a.credits} /></td>
                      <td className="px-2 py-3">
                        {a.analysis && b ? (
                          <span className="flex items-center gap-2"><Donut score={a.analysis.score} /><span className={`text-xs font-semibold ${b.text}`}>{b.label}</span></span>
                        ) : a.deleted ? null : scoreButton(a)}
                        <ErrorText msg={errors[a.id] ?? ''} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {/* Messaged people keep the button (they can write again), with a quiet "Message sent" under it. */}
                        {!a.deleted && !a.deactivated && (
                          <span className="inline-flex flex-col items-center gap-1">
                            <Link href={`/messages?with=${a.worker_id}&job=${id}`} onClick={(e) => e.stopPropagation()}
                              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${a.messaged ? 'bg-white text-emerald-900 ring-1 ring-emerald-300 hover:bg-emerald-50' : 'bg-emerald-950 text-white hover:bg-emerald-900'}`}>Message</Link>
                            {a.messaged && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>Message sent
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* The drawer: slides in from the right over the table's right side; the list stays usable, so clicking
          another row switches person. ↑ ↓ (or j k) move, Esc closes. Long notes scroll inside the drawer. */}
      <aside aria-label="Applicant details" aria-hidden={!current} inert={!current}
        className={`fixed inset-y-0 right-0 z-40 flex w-full flex-col bg-white shadow-[-24px_0_48px_-24px_rgba(15,23,42,0.35)] ring-1 ring-slate-200 transition-transform duration-200 ease-out sm:w-[min(44rem,55vw)] ${current ? 'translate-x-0' : 'translate-x-full'}`}>
        {person && (
          <>
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
              <button type="button" onClick={() => move(-1)} disabled={idx <= 0} aria-label="Previous applicant" className="grid h-8 w-8 place-items-center rounded-lg ring-1 ring-slate-200 hover:ring-emerald-600 disabled:opacity-40">↑</button>
              <button type="button" onClick={() => move(1)} disabled={idx < 0 || idx >= shown.length - 1} aria-label="Next applicant" className="grid h-8 w-8 place-items-center rounded-lg ring-1 ring-slate-200 hover:ring-emerald-600 disabled:opacity-40">↓</button>
              <span className="text-xs text-slate-500">{idx >= 0 ? `${idx + 1} of ${shown.length}` : ''} <span className="hidden sm:inline">· ↑ ↓ keys</span></span>
              <button type="button" onClick={() => setSel(null)} aria-label="Close" className="ml-auto grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-lg text-slate-600 hover:bg-slate-200">×</button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <div className="flex items-center gap-3">
                <Initials name={person.name} id={person.worker_id} size="h-12 w-12 text-sm" />
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-900">{person.deleted ? 'Deleted account' : person.name}</h2>
                  <p className="text-sm text-slate-500">
                    {[person.title, person.hourly_rate && `$${Number(person.hourly_rate)}/hr`].filter(Boolean).join(' · ')} · applied <TimeAgo date={person.created_at} />
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
                    Spent <b>{person.credits} of 60</b> daily Credits on this job · {interest(person.credits).label} <InfoCard id="tip-credits" icon="⚡" title="Interest">{CREDITS_INFO}</InfoCard>
                  </p>
                  {(person.hired || person.messaged || person.deactivated) && <p className="text-xs font-semibold text-emerald-800">{person.deactivated ? 'Paused · not taking messages' : person.hired ? 'Hired' : '✓ Message sent'}</p>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                {!person.deleted && !person.deactivated && <Link href={`/messages?with=${person.worker_id}&job=${id}`} className="rounded-lg bg-emerald-950 px-3 py-2 text-white hover:bg-emerald-900">Message {first(person.name)}</Link>}
                {person.resume_name && <button type="button" onClick={() => openResume(person.id, person.resume_name!)} className="rounded-lg px-3 py-2 text-slate-700 ring-1 ring-slate-200 hover:ring-emerald-600">Resume (PDF)</button>}
                {!person.deleted && <Link href={`/workers/${person.worker_id}`} className="rounded-lg px-3 py-2 text-slate-700 ring-1 ring-slate-200 hover:ring-emerald-600">Full profile</Link>}
                {!person.deleted && <a href={`mailto:${person.email}`} className="rounded-lg px-3 py-2 text-slate-700 ring-1 ring-slate-200 hover:ring-emerald-600">Email</a>}
                {!person.deleted && (
                  <button type="button" onClick={() => toggleSave(person)} aria-pressed={isSaved(person)}
                    className={`ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 ring-1 transition ${isSaved(person) ? 'bg-amber-50 text-amber-900 ring-amber-300' : 'text-slate-700 ring-slate-200 hover:ring-amber-400'}`}>
                    {isSaved(person) ? '★ Bookmarked' : '☆ Bookmark this worker'}
                  </button>
                )}
              </div>

              {(() => {
                const b = person.analysis && band(person.analysis.score);
                return (
                  <div className={`rounded-xl p-4 ${b ? b.bg : 'bg-slate-50'}`}>
                    {person.analysis && b ? (
                      <>
                        <div className="flex items-center gap-3">
                          <Donut score={person.analysis.score} size={64} />
                          <div><p className={`font-semibold ${b.text}`}>Smart Score · {b.label}</p><p className="text-sm text-slate-600">{person.analysis.verdict}</p></div>
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {([['Strengths', person.analysis.strengths, 'text-emerald-700'], ['Concerns', person.analysis.concerns, 'text-amber-700']] as const).map(([title, items, color]) => (
                            <div key={title}>
                              <p className={`text-[11px] font-semibold uppercase tracking-wide ${color}`}>{title}</p>
                              {items.length ? <ul className="mt-1 space-y-1 text-sm text-slate-700">{items.map((x) => <li key={x}>· {x}</li>)}</ul> : <p className="text-sm text-slate-500">None noted</p>}
                            </div>
                          ))}
                        </div>
                        {!outOfFree && !scoring && <button type="button" onClick={() => analyze(person.id, true)} disabled={busy[person.id]} className="mt-3 text-xs font-semibold text-slate-600 hover:underline">{busy[person.id] ? 'Re-scoring…' : '↻ Score again'}</button>}
                      </>
                    ) : (
                      <>
                        <p className="font-semibold text-slate-900">No Smart Score yet</p>
                        <p className="mt-1 text-sm text-slate-600">{outOfFree ? outText : scoreTip(person.name)}</p>
                        {person.deleted ? null : outOfFree
                          ? u?.limit !== null && <Link href="/pricing" className="mt-3 inline-block rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-amber-300">See plans</Link>
                          : <button type="button" onClick={() => analyze(person.id)} disabled={busy[person.id] || !!scoring} className="mt-3 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-amber-300 disabled:opacity-60">{busy[person.id] ? 'Scoring…' : 'Get Smart Score'}</button>}
                      </>
                    )}
                    <ErrorText msg={errors[person.id] ?? ''} />
                  </div>
                );
              })()}

              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Cover letter</p>
                <p className="whitespace-pre-line leading-relaxed text-slate-700">{person.cover_letter}</p>
              </div>
              {!!person.skills?.length && <div><p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Skills</p><Skills skills={person.skills} /></div>}
            </div>
          </>
        )}
      </aside>

      {composing && <BulkMessage rows={list.filter((a) => picked.has(a.id))} onClose={() => setComposing(false)} onRemove={togglePick}
        onSent={(text) => { setComposing(false); setSentNow((s) => new Set([...s, ...picked])); setPicked(new Set()); setSentNote(text); }} />}
      <ResumeModal resume={viewing} onClose={() => setViewing(null)} />
      <p className="text-xs text-slate-400">Smart Scores are a screening aid based on the job post and what applicants wrote. Always review applications yourself before deciding.</p>
    </div>
  );
}
