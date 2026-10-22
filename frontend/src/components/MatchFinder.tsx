'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { API, read, useApi } from '@/lib/api';
import { ErrorText, Initials, buttonGold } from '@/components/ui';

type Step =
  | { type: 'thought'; text: string }
  | { type: 'search'; query: string; skills: string[]; max_rate: number | null; availability: string | null; found: number }
  | { type: 'profile'; worker_id: number; name: string }
  | { type: 'done'; count: number };
type Match = {
  score: number; reason: string; hired: boolean; over_budget: boolean;
  worker: { id: number; name: string; title: string; skills: string[] | null; hourly_rate: string | null; availability: string | null; deactivated: boolean; limited: boolean };
};
type Run = { id: number; status: 'running' | 'done' | 'failed'; summary: string | null; steps: Step[]; created_at: string; matches: Match[] };
type Usage = { plan: 'free' | 'pro' | 'premium'; used: number; limit: number; remaining: number };
type Data = { runs: { id: number; status: Run['status']; count: number; created_at: string }[]; run: Run | null; budget: string; usage: Usage };

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function StepLine({ step, working }: { step: Step; working?: boolean }) {
  const text = step.type === 'thought' ? <span className="italic text-slate-500">{step.text}</span>
    : step.type === 'search' ? <>🔎 Searched <b>“{step.query || step.skills.join(', ') || 'everyone'}”</b>{step.availability && ` · ${step.availability}`}{step.max_rate !== null && ` · up to $${step.max_rate}/hr`} · <span className="font-semibold text-emerald-700 tabular-nums">{step.found} found</span></>
    : step.type === 'profile' ? <>📄 Read <b>{step.name}</b>’s profile</>
    : <>✅ Shortlisted <b>{step.count} {step.count === 1 ? 'person' : 'people'}</b></>;
  return (
    <li className="relative pl-5 text-sm text-slate-700">
      <span className={`absolute -left-[7px] top-1.5 h-3 w-3 rounded-full ${step.type === 'done' ? 'bg-emerald-500' : `bg-white ring-2 ring-emerald-400 ${working ? 'animate-pulse' : ''}`}`} aria-hidden="true" />
      {text}
    </li>
  );
}
const Steps = ({ steps, live }: { steps: Step[]; live?: boolean }) => (
  <ol className="ml-2 space-y-2 border-l-2 border-emerald-100 py-1">
    {steps.map((s, i) => <StepLine key={i} step={s} working={live && i === steps.length - 1} />)}
  </ol>
);

function MatchRow({ m, rank, budget }: { m: Match; rank: number; budget: string }) {
  const w = m.worker;
  return (
    <li className="grid gap-3 rounded-2xl bg-emerald-50/30 p-4 ring-1 ring-emerald-950/5 sm:grid-cols-[auto_1fr_auto]">
      <span className="hidden w-5 pt-3 text-right text-xs font-bold text-slate-400 tabular-nums sm:block">{rank}</span>
      <div className="flex min-w-0 gap-3">
        <Initials name={w.name} id={w.id} size="h-11 w-11 text-sm" />
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-1.5 font-semibold text-slate-900">
            {w.name}
            {m.hired && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Hired</span>}
            {w.deactivated && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Paused · not taking messages</span>}
            {m.over_budget && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">${Number(w.hourly_rate)}/hr · above your {budget.replace(/ per hour$/, '')} budget</span>}
          </p>
          <p className="text-xs text-slate-500">{w.title}</p>
          <p className="text-sm text-slate-800">✨ {m.reason}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
        <span className={`rounded-xl px-2.5 py-1.5 font-display text-lg font-bold tabular-nums ${m.score >= 85 ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`} title="Smart Score">{m.score}</span>
        <span className="flex gap-1.5">
          {!w.deactivated && !w.limited && <Link href={`/messages?with=${w.id}`} className="rounded-full bg-emerald-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900">Message</Link>}
          <Link href={`/workers/${w.id}`} className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:ring-emerald-600">View</Link>
        </span>
      </div>
    </li>
  );
}

// Smart Matching: an AI recruiter searches all talent for this job and shortlists up to 10 people, each with
// a reason. The page places two pieces: a small button (with a "what is this?" dropdown that also starts a
// search) and the results panel, which only appears once there's a search to show.
export function useMatchFinder(jobId: number) {
  const { data, reload } = useApi<Data>(`/jobs/${jobId}/matches`);
  const [live, setLive] = useState<Step[] | null>(null); // steps of the run in progress
  const [shown, setShown] = useState<{ run: Run | null; usage: Usage } | null>(null); // a run just finished or picked from history
  const [error, setError] = useState('');
  const [showSteps, setShowSteps] = useState(false);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [open]);
  if (!data) return { button: null, panel: null };
  const run = shown?.run ?? data.run;
  const usage = shown?.usage ?? data.usage;
  const paid = usage.limit > 0;

  async function start() {
    setOpen(false); setError(''); setLive([]); setShowSteps(false);
    try {
      const res = await fetch(`${API}/jobs/${jobId}/matches`, { method: 'POST' });
      if (!res.headers.get('content-type')?.includes('event-stream')) await read(res, 'Couldn’t start the search. Please try again.'); // throws the error
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const events = buffer.split('\n\n');
        buffer = events.pop()!;
        for (const raw of events) {
          const e = JSON.parse(raw.replace(/^data: /, ''));
          if (e.type === 'result') { setShown({ run: e.run, usage: e.usage }); reload(); }
          else if (e.type === 'error') setError(e.error);
          else if (e.type !== 'start') setLive((s) => [...(s ?? []), e]);
        }
      }
    } catch (err) {
      setError((err as Error).message || 'Can’t connect to ReadyToWork.ph. Check your internet connection and try again.');
    } finally {
      setLive(null);
    }
  }
  async function pick(id: number) {
    try { setShown({ ...(await read<Data>(await fetch(`${API}/jobs/${jobId}/matches?run=${id}`), 'Couldn’t load that search')), usage }); }
    catch (err) { setError((err as Error).message); }
  }

  const button = (
    <div ref={root} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="smart-matching"
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-emerald-600">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-amber-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.9L19 9.7l-4.2 3.1 1.4 5.2L12 15l-4.2 3 1.4-5.2L5 9.7l5.2-1.8L12 3Z" /></svg>
        Smart Matching
        {!paid && <span className="rounded bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600">Pro</span>}
        <svg viewBox="0 0 20 20" className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true"><path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div id="smart-matching" className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-xl shadow-slate-900/10">
          <p className="font-semibold text-slate-900">What is Smart Matching?</p>
          <p className="text-slate-600">It searches every worker on ReadyToWork.ph for this job, not only your applicants, and shortlists up to 10 people, best first, with a reason for each. Takes about a minute.</p>
          {paid ? (
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-xs text-slate-500 tabular-nums">{usage.remaining} of {usage.limit} left this month</span>
              <button type="button" onClick={start} disabled={usage.remaining === 0 || !!live} className={`${buttonGold} px-3 py-1.5 text-xs disabled:opacity-50`}>{run ? '↻ Search again' : 'Find my matches'}</button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-xs text-slate-500">Pro: 3 a month · Premium: 30</span>
              <Link href="/pricing" className={`${buttonGold} px-3 py-1.5 text-xs`}>See plans</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const panel = (live || run || error) ? (
    <section className="space-y-3 rounded-xl border border-slate-200/80 bg-white p-4" aria-labelledby="ai-matches" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="ai-matches" className="flex-1 font-semibold text-slate-900">Smart Matching</h2>
        {paid && <span className="text-xs text-slate-500 tabular-nums">{usage.remaining} of {usage.limit} searches left this month</span>}
      </div>
      {live ? (
        <div className="space-y-3">
          <div className="h-1 overflow-hidden rounded-full bg-emerald-50"><div className="h-full w-1/3 animate-[topload_1.1s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-emerald-500 to-amber-400" /></div>
          {live.length ? <Steps steps={live} live /> : <p className="text-slate-500">Reading your job post…</p>}
          <p className="text-xs text-slate-500">Takes about a minute. If you leave this page before it finishes, the search isn’t counted.</p>
        </div>
      ) : run && (
        <div className="space-y-3">
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-slate-500">
            <b className="text-slate-900">{run.matches.length} {run.matches.length === 1 ? 'match' : 'matches'}</b>
            <span>found {when(run.created_at)}</span>
            {run.summary && <span>· “{run.summary}”</span>}
          </p>
          {run.matches.length
            ? <ol className="space-y-2">{run.matches.map((m, i) => <MatchRow key={m.worker.id} m={m} rank={i + 1} budget={data.budget} />)}</ol>
            : <p className="rounded-lg bg-slate-50 p-3 text-slate-600">No one fits this job well yet. Try again later as new workers join, or broaden the skills in your job post.</p>}
          <div className="flex flex-wrap items-center justify-between gap-3 text-slate-500">
            {data.runs.length > 1 && (
              <label className="flex items-center gap-2">Past searches
                <select value={run.id} onChange={(e) => pick(Number(e.target.value))} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800">
                  {data.runs.map((r) => (
                    <option key={r.id} value={r.id} disabled={r.status !== 'done'}>
                      {when(r.created_at)} · {r.status === 'done' ? `${r.count} matches` : r.status === 'running' ? 'running' : 'stopped early (not counted)'}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="button" onClick={() => setShowSteps((v) => !v)} className="font-semibold text-emerald-700 hover:underline">{showSteps ? 'Hide steps' : 'See how it searched'}</button>
          </div>
          {showSteps && <Steps steps={run.steps} />}
        </div>
      )}
      <ErrorText msg={error} />
    </section>
  ) : null;

  return { button, panel };
}
