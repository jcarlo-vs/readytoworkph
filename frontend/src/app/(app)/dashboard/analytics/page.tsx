'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { BackButton, ErrorText, Initials, PageBand, buttonGold, buttonGhost, card } from '@/components/ui';
import { Select } from '@/components/Select';

type Range = 7 | 30 | 90;
type JobRow = {
  id: number; title: string; created_at: string; closed_at: string | null; applicants: number; new_7d: number;
  scored: number; avg_score: number | null; top_score: number | null; messaged: number; hours_to_first: number | null; trend: number[];
};
type Analytics = {
  days: Range; job: number | null; unit: 'day' | 'week';
  tiles: {
    applicants: number; applicants_prev: number; avg_score: number | null; avg_score_prev: number | null; scored: number;
    messaged: number; messaged_prev: number; replied: number; replied_prev: number; first_applicant_hours: number | null;
  };
  chart: { start: string; applicants: number }[];
  funnel: { applied: number; scored: number; messaged: number; replied: number };
  mix: { strong: number; good: number; partial: number; poor: number };
  candidates: { id: number; job_id: number; worker_id: number; name: string; title: string; score: number; credits: number }[];
  jobs: JobRow[];
};

const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const short = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : null);
const hours = (h: number | null) => (h === null ? '-' : h < 24 ? `${Math.max(h, 1)}h` : `${Math.round(h / 24)}d`);
// Same bands and colors as the fit scores on the applicants page.
const BANDS = [
  { key: 'strong', label: 'Strong fit', range: '85+', color: 'bg-emerald-600' },
  { key: 'good', label: 'Good fit', range: '65-84', color: 'bg-emerald-400' },
  { key: 'partial', label: 'Partial fit', range: '40-64', color: 'bg-amber-400' },
  { key: 'poor', label: 'Poor fit', range: 'under 40', color: 'bg-red-400' },
] as const;
const scoreTone = (s: number) => (s >= 85 ? 'bg-emerald-100 text-emerald-800' : s >= 65 ? 'bg-emerald-50 text-emerald-700' : s >= 40 ? 'bg-amber-100 text-amber-800' : 'bg-red-50 text-red-700');

export default function AnalyticsPage() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (!user) return <p><Link href="/login?next=/dashboard/analytics" className="text-emerald-700 underline">Log in as an employer</Link> to see hiring analytics.</p>;
  if (user.role !== 'employer') return (
    <div className={`${card} mx-auto max-w-xl space-y-4 p-10 text-center`}>
      <h1 className="font-display text-2xl font-bold text-slate-900">Hiring analytics is for employers</h1>
      <p className="text-slate-600">You&apos;re signed in with a worker account. Your job search lives on your dashboard.</p>
      <div className="flex flex-wrap justify-center gap-3"><Link href="/dashboard" className={buttonGhost}>Go to my dashboard</Link><Link href="/jobs?sort=new" className={buttonGold}>Browse jobs</Link></div>
    </div>
  );
  return user.plan === 'premium' ? <Dashboard /> : <Teaser />;
}

// What non-Premium employers see: what the page offers, and the way to it.
function Teaser() {
  return (
    <div className="space-y-6">
      <BackButton href="/dashboard">Dashboard</BackButton>
      <div className={`${card} mx-auto max-w-xl space-y-4 p-10 text-center`}>
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-950 text-amber-300" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
        </span>
        <h1 className="font-display text-2xl font-bold text-slate-900">Hiring analytics</h1>
        <p className="text-slate-600">See how every job is doing: applicants over time, where candidates drop off, your fit-score mix, and the best people you haven&apos;t contacted yet. Included with Premium.</p>
        <Link href="/pricing" className={buttonGold}>See Premium</Link>
      </div>
    </div>
  );
}

function Delta({ now, before, unit = '%' }: { now: number | null; before: number | null; unit?: '%' | ' pts' }) {
  if (now === null || before === null || (unit === '%' && !before)) return <span className="text-slate-400">nothing earlier to compare</span>;
  const d = unit === '%' ? Math.round(((now - before) / before) * 100) : now - before;
  if (d === 0) return <span className="text-slate-500">no change</span>;
  return <span className={`font-semibold ${d > 0 ? 'text-emerald-700' : 'text-red-600'}`}>{d > 0 ? '↑' : '↓'} {Math.abs(d)}{unit}</span>;
}

function Tile({ label, value, hint }: { label: string; value: React.ReactNode; hint: React.ReactNode }) {
  return (
    <div className={`${card} p-5`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold tabular-nums text-slate-900">{value}</p>
      <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

// Applications per day (7 or 30 days) or per week (90 days): one series, one hue, a hover label on each bar,
// and the same numbers in a table for screen readers.
function Chart({ data, unit }: { data: Analytics['chart']; unit: Analytics['unit'] }) {
  const peak = Math.max(...data.map((d) => d.applicants), 0);
  const step = peak <= 4 ? 1 : peak <= 10 ? 2 : peak <= 25 ? 5 : peak <= 50 ? 10 : Math.ceil(peak / 50) * 10;
  const top = Math.max(step, Math.ceil(peak / step) * step);
  const ticks = [0, top / 2, top].filter((t, i, a) => Number.isInteger(t) && a.indexOf(t) === i);
  const label = (d: Analytics['chart'][number]) => (unit === 'week' ? `Week of ${day(d.start)}` : day(d.start));
  return (
    <figure className="space-y-2">
      <div className="grid h-44 grid-cols-[2rem_minmax(0,1fr)] gap-2" aria-hidden="true">
        <div className="relative text-[10px] text-slate-400">
          {ticks.map((t) => <span key={t} className="absolute right-0 -translate-y-1/2 tabular-nums" style={{ top: `${100 - (t / top) * 100}%` }}>{t}</span>)}
        </div>
        <div className="relative border-b border-slate-300">
          {ticks.filter((t) => t > 0).map((t) => <div key={t} className="absolute inset-x-0 border-t border-dashed border-slate-200" style={{ top: `${100 - (t / top) * 100}%` }} />)}
          <div className={`absolute inset-0 flex items-end ${data.length > 20 ? 'gap-px' : 'gap-0.5'}`}>
            {data.map((d, i) => (
              <div key={d.start} className="group relative flex h-full flex-1 items-end justify-center">
                <div className={`w-full max-w-8 rounded-t ${i === data.length - 1 ? 'bg-emerald-950' : 'bg-emerald-700'} transition-colors group-hover:bg-emerald-800`}
                  style={{ height: `${(d.applicants / top) * 100}%`, minHeight: d.applicants ? 2 : 0 }} />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow group-hover:block">
                  {label(d)}: <strong>{d.applicants}</strong>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="ml-10 flex justify-between text-[10px] text-slate-500" aria-hidden="true">
        <span>{label(data[0])}</span><span>{label(data[Math.floor(data.length / 2)])}</span><span>{unit === 'week' ? 'This week' : 'Today'}</span>
      </div>
      <table className="sr-only">
        <caption>Applications per {unit}</caption>
        <thead><tr><th>{unit === 'week' ? 'Week of' : 'Day'}</th><th>Applications</th></tr></thead>
        <tbody>{data.map((d) => <tr key={d.start}><td>{day(d.start)}</td><td>{d.applicants}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

function Spark({ values }: { values: number[] }) {
  const w = 84, h = 24, max = Math.max(...values, 1);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 4) + 2, h - 3 - (v / max) * (h - 6)]);
  const line = pts.map((p) => p.join(',')).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="ml-auto h-6 w-[84px] text-emerald-700" aria-label={`Last 12 weeks: ${values.join(', ')}`} role="img">
      <polygon points={`2,${h - 1} ${line} ${w - 2},${h - 1}`} fill="currentColor" fillOpacity="0.12" />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="2.5" fill="currentColor" />
    </svg>
  );
}

const PAGE = 10; // jobs per page in the By job table

type SortKey = 'title' | 'applicants' | 'new_7d' | 'scored' | 'avg_score' | 'messaged' | 'hours_to_first';

function Dashboard() {
  const [days, setDays] = useState<Range>(30);
  const [job, setJob] = useState<number | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'applicants', dir: -1 });
  const [find, setFind] = useState(''); // search box above the By job table
  const [page, setPage] = useState(0); // table pages of PAGE jobs; back to the first on a new search or sort
  const { data, error } = useApi<Analytics>(`/analytics?days=${days}${job ? `&job=${job}` : ''}`);
  // Keep showing the last numbers while a new range or job loads, so the page doesn't jump.
  const [shown, setShown] = useState<Analytics | null>(null);
  if (data && data !== shown) setShown(data);
  const a = data ?? shown;
  const loading = !data;

  if (error && !a) return <ErrorText msg={error} />;
  if (!a) return <p className="text-slate-500">Loading analytics…</p>;
  const t = a.tiles, f = a.funnel;
  const period = `${days} days`;
  const selected = a.jobs.find((j) => j.id === job);
  const unscored = f.applied - f.scored;
  // where "Score all" should send them: the chosen job, or the job with the most unscored applicants
  const scoreTarget = selected ?? [...a.jobs].filter((j) => !j.closed_at).sort((x, y) => (y.applicants - y.scored) - (x.applicants - x.scored))[0];
  const mixTotal = BANDS.reduce((n, b) => n + a.mix[b.key], 0);
  const rows = a.jobs.filter((j) => j.title.toLowerCase().includes(find.trim().toLowerCase())).sort((x, y) => {
    const k = sort.key;
    if (k === 'title') return x.title.localeCompare(y.title) * sort.dir;
    return ((x[k] ?? -1) - (y[k] ?? -1)) * sort.dir;
  });
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const at = Math.min(page, pages - 1);
  const pageRows = rows.slice(at * PAGE, at * PAGE + PAGE);
  const th = (key: SortKey, label: string, right = true) => (
    <th className={`px-3 py-3 font-medium ${right ? 'text-right' : 'text-left'}`} aria-sort={sort.key === key ? (sort.dir < 0 ? 'descending' : 'ascending') : 'none'}>
      <button type="button" onClick={() => { setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 })); setPage(0); }} className="whitespace-nowrap uppercase tracking-wide hover:text-slate-900">
        {label}{sort.key === key ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  );

  return (
    <div className="space-y-6">
      <BackButton href="/dashboard">Dashboard</BackButton>
      <PageBand eyebrow="Premium" title="Hiring analytics" sub={<>{selected ? selected.title : 'All jobs'} · last {period}{loading && ' · updating…'}</>}
        actions={<>
          <div className="inline-flex rounded-full bg-white/10 p-1 text-sm ring-1 ring-white/10" role="group" aria-label="Time period">
            {([7, 30, 90] as const).map((d) => (
              <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d}
                className={`rounded-full px-3.5 py-1.5 font-medium transition ${days === d ? 'bg-white text-slate-900 shadow-sm' : 'text-emerald-100 hover:text-white'}`}>{d} days</button>
            ))}
          </div>
          <Select label="Job" searchable noun="jobs" className="w-64" value={job ? String(job) : ''} onChange={(v) => setJob(v ? Number(v) : null)}
            options={[
              { value: '', label: 'All jobs', hint: `${a.jobs.length} job${a.jobs.length === 1 ? '' : 's'}`, dot: 'bg-emerald-950' },
              ...a.jobs.map((j) => ({
                value: String(j.id), label: j.title, dot: j.closed_at ? 'bg-slate-300' : 'bg-emerald-500',
                hint: `${j.closed_at ? 'Closed' : 'Open'} · ${j.applicants} applicant${j.applicants === 1 ? '' : 's'} in ${period}`,
              })),
            ]} />
        </>} />

      {a.jobs.length === 0 ? (
        <div className={`${card} space-y-3 p-10 text-center`}>
          <p className="font-semibold text-slate-900">Post a job to start seeing analytics</p>
          <Link href="/jobs/new" className={buttonGold}>Post a job</Link>
        </div>
      ) : (
        <div className={`space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Applicants" value={t.applicants} hint={t.applicants_prev ? <><Delta now={t.applicants} before={t.applicants_prev} /> vs previous {period}</> : <Delta now={null} before={null} />} />
            <Tile label="Avg Smart Score" value={t.avg_score ?? '-'} hint={<><Delta now={t.avg_score} before={t.avg_score_prev} unit=" pts" /> · {t.scored} scored</>} />
            <Tile label="Reply rate" value={t.messaged ? `${pct(t.replied, t.messaged)}%` : '-'}
              hint={t.messaged ? <><Delta now={pct(t.replied, t.messaged)} before={t.messaged_prev ? pct(t.replied_prev, t.messaged_prev) : null} unit=" pts" /> · {t.replied} of {t.messaged} replied</> : 'Message applicants to see this'} />
            <Tile label="First applicant" value={hours(t.first_applicant_hours)} hint={selected ? 'after you posted this job' : 'median time after posting'} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <section className={`${card} p-5`}>
              <div className="mb-4 flex items-baseline justify-between gap-2">
                <h2 className="font-semibold">Applications per {a.unit}</h2>
                <span className="text-xs text-slate-500">last {period}</span>
              </div>
              <Chart data={a.chart} unit={a.unit} />
            </section>
            <section className={`${card} space-y-4 p-5`}>
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-semibold">Funnel</h2>
                <span className="text-xs text-slate-500">applied in the last {period}</span>
              </div>
              <ul className="space-y-3">
                {/* scored and messaged are % of applied (people can be messaged without a score); replied is % of messaged */}
                {([['Applied', f.applied, null], ['Fit-scored', f.scored, pct(f.scored, f.applied)], ['Messaged', f.messaged, pct(f.messaged, f.applied)], ['Replied', f.replied, pct(f.replied, f.messaged)]] as const).map(([name, n, p]) => (
                  <li key={name} className="grid grid-cols-[5.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm">
                    <span className="text-slate-700">{name}</span>
                    <span className="h-6 overflow-hidden rounded-md bg-slate-100"><span className="block h-full rounded-md bg-emerald-700" style={{ width: `${f.applied ? (n / f.applied) * 100 : 0}%` }} /></span>
                    <span className="text-right tabular-nums"><strong>{n}</strong>{p !== null && <span className="block text-[11px] text-slate-500">{p}%</span>}</span>
                  </li>
                ))}
              </ul>
              {unscored > 0 && scoreTarget && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                  <span><strong>{unscored}</strong> not fit-scored yet</span>
                  <Link href={`/dashboard/jobs/${scoreTarget.id}`} className="rounded-lg bg-emerald-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900">
                    ✦ Score {selected ? 'all' : `"${scoreTarget.title}"`}
                  </Link>
                </div>
              )}
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <section className={`${card} space-y-4 p-5`}>
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-semibold">Smart Score mix</h2>
                <span className="text-xs text-slate-500">{mixTotal} scored</span>
              </div>
              {mixTotal === 0 ? <p className="text-sm text-slate-500">No Smart Scores in this period yet.</p> : (
                <ul className="space-y-2.5">
                  {BANDS.map((b) => (
                    <li key={b.key} className="grid grid-cols-[6.5rem_minmax(0,1fr)_2rem] items-center gap-3 text-sm">
                      <span className="text-slate-700">{b.label}<span className="block text-[11px] text-slate-400">{b.range}</span></span>
                      <span className="h-3.5 overflow-hidden rounded bg-slate-100"><span className={`block h-full rounded ${b.color}`} style={{ width: `${(a.mix[b.key] / Math.max(...BANDS.map((x) => a.mix[x.key]), 1)) * 100}%` }} /></span>
                      <strong className="text-right tabular-nums">{a.mix[b.key]}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className={`${card} p-5`}>
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="font-semibold">Best candidates you haven&apos;t messaged</h2>
                <span className="text-xs text-slate-500">open jobs · highest fit first</span>
              </div>
              {a.candidates.length === 0 ? (
                <p className="text-sm text-slate-500">Nobody waiting. Fit-score more applicants and the strongest ones you haven&apos;t contacted will show up here.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {a.candidates.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
                      <Initials name={c.name} id={c.worker_id} size="h-9 w-9 text-xs" />
                      <span className="min-w-0 flex-1">
                        <Link href={`/dashboard/jobs/${c.job_id}#applicant-${c.id}`} className="block truncate font-semibold text-slate-900 hover:text-emerald-800">{c.name}</Link>
                        <span className="block truncate text-xs text-slate-500">{c.title}{c.credits > 0 && <> · ⚡ {c.credits} credit{c.credits === 1 ? '' : 's'}</>}</span>
                      </span>
                      <span className={`rounded-lg px-2 py-1 font-display text-sm font-bold tabular-nums ${scoreTone(c.score)}`} title="Smart Score">{c.score}</span>
                      <Link href={`/messages?with=${c.worker_id}&job=${c.job_id}`} className={`${buttonGhost} px-3 py-1.5 text-xs`}>Message</Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">By job · last {period}</h2>
                <p className="text-xs text-slate-500">Click a column to sort, a job to focus on it</p>
              </div>
              <label className="flex w-full items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/20 sm:w-64">
                <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400">
                  <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="m13.5 13.5 3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <input value={find} onChange={(e) => { setFind(e.target.value); setPage(0); }} placeholder="Search jobs" aria-label="Search jobs in the table"
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none" />
                {find && <button type="button" onClick={() => { setFind(''); setPage(0); }} aria-label="Clear search" className="text-slate-400 hover:text-slate-700">×</button>}
              </label>
            </div>
            <div className={`${card} overflow-x-auto p-0`}>
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b border-slate-200 text-xs text-slate-500">
                  <tr>
                    {th('title', 'Job', false)}{th('applicants', 'Applicants')}{th('new_7d', 'New (7d)')}{th('scored', 'Fit-scored')}
                    {th('avg_score', 'Avg / top')}{th('messaged', 'Messaged')}{th('hours_to_first', 'First applicant')}
                    <th className="whitespace-nowrap px-4 py-3 text-right font-medium uppercase tracking-wide">12 weeks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">No jobs match &ldquo;{find.trim()}&rdquo;</td></tr>
                  )}
                  {pageRows.map((j) => (
                    <tr key={j.id} className={j.id === job ? 'bg-emerald-50/60' : 'hover:bg-slate-50'}>
                      <td className="px-3 py-3">
                        <button type="button" onClick={() => setJob(j.id === job ? null : j.id)} className="text-left font-semibold text-emerald-800 hover:underline">{j.title}</button>
                        <span className="block text-xs text-slate-500">Posted {short(j.created_at)}{j.closed_at && ' · Closed'} · <Link href={`/dashboard/jobs/${j.id}`} className="hover:underline">Applicants</Link></span>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-900">{j.applicants}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-700">{j.new_7d || '-'}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-700">{j.scored} <span className="text-slate-400">({pct(j.scored, j.applicants) ?? 0}%)</span></td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-700">{j.avg_score ?? '-'} / {j.top_score ?? '-'}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-700">{j.messaged}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-700">{hours(j.hours_to_first)}</td>
                      <td className="px-4 py-3"><Spark values={j.trend} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > PAGE && (
              <nav className="flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Job table pages">
                <span className="text-slate-500 tabular-nums">
                  {at * PAGE + 1}–{at * PAGE + pageRows.length} of {rows.length.toLocaleString('en-US')} jobs
                </span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setPage(at - 1)} disabled={at === 0} className={`${buttonGhost} px-3 py-1.5 text-xs disabled:opacity-40`}>← Previous</button>
                  <span className="text-xs text-slate-500 tabular-nums">Page {at + 1} of {pages}</span>
                  <button type="button" onClick={() => setPage(at + 1)} disabled={at >= pages - 1} className={`${buttonGhost} px-3 py-1.5 text-xs disabled:opacity-40`}>Next →</button>
                </div>
              </nav>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
