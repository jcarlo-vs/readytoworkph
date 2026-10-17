'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api, useApi, interest, salary, type Job } from '@/lib/api';
import { Skills, ErrorText, BackButton, TimeAgo, buttonGhost, card } from '@/components/ui';
import { ResumeModal, type ViewableResume } from '@/components/ResumeModal';

type Analysis = { score: number; verdict: string; strengths: string[]; concerns: string[]; resume?: 'read' | 'unreadable' | 'none' };
type Usage = { plan: 'free' | 'premium'; used: number; limit: number; remaining: number | null };
type Applicant = {
  id: number; worker_id: number; name: string; email: string; title: string | null; skills: string[] | null;
  cover_letter: string; credits: number; created_at: string; analysis: Analysis | null; resume_name: string | null;
};

const band = (score: number) =>
  score >= 85 ? { label: 'Strong fit', ring: 'stroke-emerald-600', text: 'text-emerald-800', bg: 'bg-emerald-50' }
  : score >= 65 ? { label: 'Good fit', ring: 'stroke-emerald-400', text: 'text-emerald-700', bg: 'bg-emerald-50/60' }
  : score >= 40 ? { label: 'Partial fit', ring: 'stroke-amber-400', text: 'text-amber-800', bg: 'bg-amber-50' }
  : { label: 'Poor fit', ring: 'stroke-red-400', text: 'text-red-700', bg: 'bg-red-50' };

function ScoreRing({ score }: { score: number }) {
  const b = band(score);
  return (
    <div className="relative h-16 w-16 shrink-0" role="img" aria-label={`AI score ${score} out of 100, ${b.label}`}>
      <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" className="stroke-slate-200" />
        <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" strokeLinecap="round" className={b.ring}
          strokeDasharray={`${(score / 100) * 97.4} 97.4`} />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-lg font-bold ${b.text}`}>{score}</span>
    </div>
  );
}

function AnalysisPanel({ analysis }: { analysis: Analysis }) {
  const b = band(analysis.score);
  return (
    <div className={`space-y-3 rounded-xl p-4 ${b.bg}`}>
      <div className="flex items-center gap-4">
        <ScoreRing score={analysis.score} />
        <div>
          <p className={`text-sm font-semibold ${b.text}`}>AI score · {b.label}</p>
          <p className="text-sm text-slate-700">{analysis.verdict}</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {[['Strengths', analysis.strengths, '✓', 'text-emerald-700'], ['Concerns', analysis.concerns, '!', 'text-amber-700']].map(([title, items, mark, color]) => (
          <div key={title as string}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title as string}</p>
            {(items as string[]).length === 0 ? <p className="text-sm text-slate-400">None noted</p> : (
              <ul className="space-y-1 text-sm text-slate-700">
                {(items as string[]).map((s) => <li key={s} className="flex gap-2"><span className={`font-bold ${color}`}>{mark as string}</span>{s}</li>)}
              </ul>
            )}
          </div>
        ))}
      </div>
      {analysis.resume && (
        <p className="text-xs text-slate-500">
          {analysis.resume === 'read' ? 'Based on profile, cover letter and resume.'
            : analysis.resume === 'unreadable' ? 'Resume couldn’t be read (scanned image), so the score is based on profile and cover letter.'
            : 'No resume attached. Score is based on profile and cover letter.'}
        </p>
      )}
    </div>
  );
}

export default function Applicants() {
  const { id } = useParams<{ id: string }>();
  const { data: apps, error } = useApi<Applicant[]>(`/jobs/${id}/applications`);
  const { data: job } = useApi<Job>(`/jobs/${id}`);
  const { data: initialUsage } = useApi<Usage>('/analyzer/usage');
  const [usage, setUsage] = useState<Usage | null>(null);
  const [results, setResults] = useState<Record<number, Analysis>>({});
  const [busy, setBusy] = useState<Record<number, boolean>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [sortBy, setSortBy] = useState<'credits' | 'score'>('credits');
  const u = usage ?? initialUsage;
  const outOfFree = u?.remaining === 0;

  async function analyze(appId: number) {
    setBusy((b) => ({ ...b, [appId]: true }));
    setErrors((e) => ({ ...e, [appId]: '' }));
    try {
      const res = await api<{ analysis: Analysis; usage: Usage }>(`/applications/${appId}/analyze`, { method: 'POST' });
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

  const list = (apps ?? []).map((a) => ({ ...a, analysis: results[a.id] ?? a.analysis }));
  if (sortBy === 'score') list.sort((x, y) => (y.analysis?.score ?? -1) - (x.analysis?.score ?? -1));

  return (
    <div className="space-y-6">
      <BackButton href="/dashboard">My Jobs</BackButton>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Applicants{job && <span className="text-slate-400"> · {job.title}</span>}</h1>
          <p className="text-sm text-slate-500">{list.length} applicant{list.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex rounded-lg bg-slate-100 p-1 text-sm" role="group" aria-label="Sort applicants">
          {(['credits', 'score'] as const).map((s) => (
            <button key={s} type="button" onClick={() => setSortBy(s)} aria-pressed={sortBy === s}
              className={`rounded-md px-3 py-1.5 font-medium transition ${sortBy === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
              {s === 'credits' ? 'Most Credits' : 'Highest AI score'}
            </button>
          ))}
        </div>
      </div>

      {job && (
        <details className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" /></svg>
            </span>
            <span className="flex-1">
              <span className="block font-semibold text-slate-900">Job description</span>
              <span className="block text-xs text-slate-500">{job.title} · {job.job_type[0].toUpperCase() + job.job_type.slice(1)} · {salary(job)}</span>
            </span>
            <svg viewBox="0 0 20 20" className="h-5 w-5 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true">
              <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <div className="space-y-4 border-t border-slate-100 px-5 py-5">
            <p className="whitespace-pre-line leading-relaxed text-slate-700">{job.description}</p>
            {job.skills.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Skills required</p>
                <Skills skills={job.skills} />
              </div>
            )}
            <Link href={`/jobs/${job.id}`} className="inline-block text-sm font-medium text-emerald-800 hover:underline">View public post ›</Link>
          </div>
        </details>
      )}

      {u && (
        <div className={`${card} flex flex-wrap items-center gap-4 p-4`}>
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-950 text-amber-300" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.8 4.9L19 9.7l-4.2 3.1 1.4 5.2L12 15l-4.2 3 1.4-5.2L5 9.7l5.2-1.8L12 3Z" /></svg>
          </span>
          <div className="min-w-48 flex-1">
            <p className="font-semibold">AI Application Analyzer</p>
            {u.plan === 'premium' ? (
              <p className="text-sm text-slate-500">Premium · unlimited analyses</p>
            ) : (
              <>
                <p className="text-sm text-slate-500"><strong className="text-slate-800">{u.remaining}</strong> of {u.limit} free analyses left</p>
                <div className="mt-1.5 h-1.5 max-w-xs overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-amber-400" style={{ width: `${((u.remaining ?? 0) / u.limit) * 100}%` }} />
                </div>
              </>
            )}
          </div>
          {u.plan === 'free' && <Link href="/premium" className={`${buttonGhost} px-4 py-2`}>Upgrade to Premium</Link>}
        </div>
      )}

      <ErrorText msg={error} />
      {apps?.length === 0 && <p className={`${card} text-center text-slate-500`}>No applicants yet. They&apos;ll appear here as workers apply.</p>}
      <ul className="space-y-4">
        {list.map((a) => (
          <li key={a.id} id={`applicant-${a.id}`} className={`${card} scroll-mt-24 space-y-4 target:ring-2 target:ring-amber-400`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link href={`/workers/${a.worker_id}`} className="font-semibold text-emerald-800 hover:underline">{a.name}</Link>
                <p className="text-sm text-slate-500">
                  {a.title || 'No title'} · applied <TimeAgo date={a.created_at} /> · <a href={`mailto:${a.email}`} className="underline">{a.email}</a>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${interest(a.credits).className}`}>
                  ⚡ {a.credits} credit{a.credits === 1 ? '' : 's'} · {interest(a.credits).label}
                </span>
                {a.resume_name && (
                  <button type="button" onClick={() => openResume(a.id, a.resume_name!)} title={a.resume_name}
                    className={`${buttonGhost} gap-1.5 px-3 py-1.5 text-xs`}>
                    <span className="rounded bg-red-50 px-1 text-[10px] font-bold text-red-600" aria-hidden="true">PDF</span>Resume
                  </button>
                )}
                <Link href={`/messages?with=${a.worker_id}&job=${id}`} className={`${buttonGhost} px-3 py-1.5 text-xs`}>Message</Link>
              </div>
            </div>
            <Skills skills={a.skills ?? []} />
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{a.cover_letter}</p>

            {a.analysis ? <AnalysisPanel analysis={a.analysis} /> : (
              <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                {outOfFree ? (
                  <>
                    <p className="text-sm text-slate-500">You&apos;ve used your {u?.limit} free AI analyses.</p>
                    <Link href="/premium" className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-300">Upgrade to analyze</Link>
                  </>
                ) : (
                  <button type="button" onClick={() => analyze(a.id)} disabled={busy[a.id]}
                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-60">
                    {busy[a.id] ? (
                      <><span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent" aria-hidden="true" />Analyzing…</>
                    ) : <>✦ Analyze with AI</>}
                  </button>
                )}
                <ErrorText msg={errors[a.id] ?? ''} />
              </div>
            )}
          </li>
        ))}
      </ul>
      <ResumeModal resume={viewing} onClose={() => setViewing(null)} />
      <p className="text-xs text-slate-400">AI scores are a screening aid based on the job post and what applicants wrote. Always review applications yourself before deciding.</p>
    </div>
  );
}
