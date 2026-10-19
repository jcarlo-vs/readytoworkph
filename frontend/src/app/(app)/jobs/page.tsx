'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useApi, salary, type Credits, type Job, type Worker } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Skills, ErrorText, Initials, TimeAgo, SearchLabel, band, button, card, input } from '@/components/ui';
import { Select, JOB_TYPES } from '@/components/Select';

const TYPE_TAG: Record<string, string> = {
  'full-time': 'bg-emerald-100 text-emerald-800',
  'part-time': 'bg-amber-100 text-amber-900',
  gig: 'bg-violet-100 text-violet-800',
};
const TypeTag = ({ type }: { type: string }) => (
  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TYPE_TAG[type] ?? 'bg-slate-100 text-slate-700'}`}>
    {JOB_TYPES.find((t) => t.value === type)?.label ?? type}
  </span>
);
const AppliedTag = () => <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold text-white">Applied</span>;

type MyApp = { job_id: number };

// /jobs is a landing page until the worker searches; then it becomes a list + detail split view.
export default function JobsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const worker = user?.role === 'worker';
  const { data: mine } = useApi<MyApp[]>(worker ? '/my/applications' : null);
  const applied = new Set(mine?.map((a) => a.job_id));

  // The URL is the search (minus `job`, the selected result), so links and the back button work.
  const search = new URLSearchParams(params);
  search.delete('job');
  const query = search.toString();
  const fromUrl = () => ({ q: params.get('q') ?? '', skill: params.get('skill') ?? '', type: params.get('type') ?? '' });
  const [form, setForm] = useState(fromUrl);
  const [shown, setShown] = useState(query);
  if (shown !== query) { setShown(query); setForm(fromUrl()); }
  const [searching, startSearch] = useTransition();
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    // An empty search lists every open job, newest first, instead of going back to the landing page.
    const filled = new URLSearchParams(Object.entries(form).filter(([, v]) => v.trim()));
    startSearch(() => router.push(`/jobs?${filled.size ? filled : 'sort=new'}`));
  };

  return query
    ? <Results query={query} selectedId={Number(params.get('job')) || null} form={form} setForm={setForm} onSearch={go} searching={searching} applied={applied} />
    : <Landing form={form} setForm={setForm} onSearch={go} searching={searching} applied={applied} />;
}

type Form = { q: string; skill: string; type: string };
type SearchProps = { form: Form; setForm: (f: Form) => void; onSearch: (e: React.FormEvent) => void; searching: boolean; applied: Set<number> };

function Landing({ form, setForm, onSearch, searching, applied }: SearchProps) {
  const { user } = useAuth();
  const worker = user?.role === 'worker';
  const { data: jobs, error } = useApi<Job[]>('/jobs');
  const { data: credits } = useApi<Credits>(worker ? '/credits' : null);
  const { data: profile } = useApi<Worker>(worker ? `/workers/${user.id}` : null);

  // ponytail: matches against the latest 20 jobs in the browser; move to the API once there are many jobs.
  const skills = new Set(profile?.skills ?? []);
  const forYou = (jobs ?? [])
    .map((j) => ({ job: j, matches: j.skills.filter((s) => skills.has(s)).length }))
    .filter((m) => m.matches > 0)
    .sort((a, b) => b.matches - a.matches)
    .slice(0, 4);

  return (
    <div className="space-y-10">
      <section className={`${band} space-y-4 px-6 py-10 sm:px-10`}>
        {!user && <p className="text-sm font-medium text-emerald-200">Remote jobs for Filipino talent</p>}
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          {worker ? 'What do you want to work on next?' : <>Find real remote work, <span className="text-amber-400">paid in dollars</span></>}
        </h1>
        <form onSubmit={onSearch} className="flex max-w-2xl gap-2 rounded-2xl bg-white p-2 shadow-lg">
          <input className="min-w-0 flex-1 rounded-xl px-3 text-slate-900 outline-none" placeholder="Job title, skill or keyword" aria-label="Search jobs"
            value={form.q} onChange={(e) => setForm({ ...form, q: e.target.value })} />
          <button className={`${button} rounded-xl`} disabled={searching}><SearchLabel pending={searching} /></button>
        </form>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-emerald-100">
          {credits && (
            <span className="flex items-center gap-1.5" title="Spend Credits when you apply: more Credits put you higher on the employer's list. They refill every midnight (PH time).">
              <svg viewBox="0 0 20 20" className="h-4 w-4 text-amber-400" aria-hidden="true"><path d="M11 2 4 11h5l-1 7 7-9h-5l1-7Z" fill="currentColor" /></svg>
              {credits.remaining} of {credits.daily} Credits left today
              <span className="text-emerald-300/80">· refills at midnight</span>
            </span>
          )}
          {worker && <Link href="/dashboard" className="underline-offset-4 hover:text-white hover:underline">Applied to {applied.size} job{applied.size === 1 ? '' : 's'}</Link>}
          <span className="flex flex-wrap gap-2">
            {JOB_TYPES.map((t) => (
              <Link key={t.value} href={`/jobs?type=${t.value}`} className="rounded-full border border-emerald-700 px-3 py-1 text-xs font-medium text-emerald-100 hover:border-amber-400 hover:text-white">{t.label}</Link>
            ))}
          </span>
        </div>
      </section>

      <ErrorText msg={error} />

      {forYou.length > 0 && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-xl font-bold">Jobs for you</h2>
            <p className="text-sm text-slate-500">Based on your skills: {[...skills].slice(0, 4).join(', ')}</p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {forYou.map(({ job: j, matches }) => (
              <li key={j.id}>
                <Link href={`/jobs/${j.id}`} className={`${card} flex h-full flex-col gap-2 transition hover:border-emerald-600 hover:shadow-md`}>
                  <div className="flex items-center justify-between gap-2">
                    <TypeTag type={j.job_type} />
                    {applied.has(j.id) ? <AppliedTag /> : (
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">Matches {matches} skill{matches === 1 ? '' : 's'}</span>
                    )}
                  </div>
                  <h3 className="font-display text-lg font-bold text-slate-900">{j.title}</h3>
                  <p className="text-sm text-slate-500">{j.employer_name} · <TimeAgo date={j.created_at} /></p>
                  <p className="line-clamp-2 text-sm leading-relaxed text-slate-600">{j.description}</p>
                  <p className="mt-auto pt-1 font-semibold text-emerald-900">{salary(j)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl font-bold">Latest jobs</h2>
          <Link href="/jobs?sort=new" className="text-sm font-semibold text-emerald-700 hover:text-emerald-900">Browse all jobs</Link>
        </div>
        <ul className="space-y-3">
          {jobs?.slice(0, 8).map((j) => (
            <li key={j.id}>
              <Link href={`/jobs/${j.id}`} className={`${card} flex flex-wrap items-start justify-between gap-x-6 gap-y-2 p-5 transition hover:border-emerald-600 hover:shadow-md`}>
                <div className="min-w-0 flex-1 basis-80">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display font-bold text-slate-900">{j.title}</h3>
                    <TypeTag type={j.job_type} />
                    {applied.has(j.id) && <AppliedTag />}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{j.employer_name} · <TimeAgo date={j.created_at} /></p>
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-600">{j.description}</p>
                </div>
                <p className="font-semibold text-emerald-900">{salary(j)}</p>
              </Link>
            </li>
          ))}
        </ul>
        {jobs?.length === 0 && <p className={`${card} text-center text-slate-500`}>No jobs posted yet. Check back soon.</p>}
      </section>
    </div>
  );
}

function Results({ query, selectedId, form, setForm, onSearch, searching, applied }: SearchProps & { query: string; selectedId: number | null }) {
  const { data: jobs, error } = useApi<Job[]>(`/jobs?${query}`);
  const selected = jobs?.find((j) => j.id === selectedId) ?? jobs?.[0];
  const select = (id: number) => `/jobs?${query}&job=${id}`;

  const row = (j: Job) => (
    <>
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-display font-bold text-slate-900">{j.title}</h2>
        {applied.has(j.id) && <AppliedTag />}
      </div>
      <p className="text-sm text-slate-500">{j.employer_name} · <TimeAgo date={j.created_at} /></p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <TypeTag type={j.job_type} />
        <span className="font-semibold text-emerald-900">{salary(j)}</span>
      </div>
    </>
  );

  return (
    <div className="space-y-5">
      <form onSubmit={onSearch} className={`${card} grid gap-3 p-3 sm:grid-cols-[2fr_1fr_1fr_auto]`}>
        <input className={input} placeholder="Job title or keyword" aria-label="Search jobs"
          value={form.q} onChange={(e) => setForm({ ...form, q: e.target.value })} />
        <input className={input} placeholder="Skill (e.g. seo)" aria-label="Skill"
          value={form.skill} onChange={(e) => setForm({ ...form, skill: e.target.value })} />
        <Select label="Job type" value={form.type} onChange={(type) => setForm({ ...form, type })}
          options={[{ value: '', label: 'Any type' }, ...JOB_TYPES]} />
        <button className={button} disabled={searching}><SearchLabel pending={searching} /></button>
      </form>

      <ErrorText msg={error} />
      {jobs && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <p><strong className="text-slate-900">{jobs.length === 20 ? '20 newest' : jobs.length} job{jobs.length === 1 ? '' : 's'}</strong>{form.q && <> for “{form.q}”</>}</p>
          <Link href="/jobs" className="font-semibold text-emerald-700 hover:text-emerald-900">Clear search</Link>
        </div>
      )}
      {jobs?.length === 0 && <p className={`${card} text-center text-slate-500`}>No jobs match your search yet. Try a broader keyword.</p>}

      {!!jobs?.length && (
        <div className="grid items-start gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <ul className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto">
            {jobs.map((j) => {
              const on = j.id === selected?.id;
              return (
                <li key={j.id} className="border-b border-slate-100 last:border-0">
                  {/* Phones go straight to the job page; wide screens show it on the right. */}
                  <Link href={`/jobs/${j.id}`} className="block space-y-1.5 p-4 hover:bg-slate-50 lg:hidden">{row(j)}</Link>
                  <Link href={select(j.id)} scroll={false} replace aria-current={on ? 'true' : undefined}
                    className={`hidden space-y-1.5 p-4 transition lg:block ${on ? 'bg-emerald-50 shadow-[inset_3px_0_0_#047857]' : 'hover:bg-slate-50'}`}>{row(j)}</Link>
                </li>
              );
            })}
          </ul>

          {selected && (
            <article className={`${card} hidden space-y-5 p-8 lg:sticky lg:top-24 lg:block lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto`}>
              <div className="flex items-center gap-3">
                <Initials name={selected.employer_name} id={selected.employer_id} size="h-11 w-11 text-sm" />
                <div>
                  <p className="font-semibold text-slate-900">{selected.employer_name}</p>
                  <p className="text-sm text-slate-500">Posted <TimeAgo date={selected.created_at} /></p>
                </div>
              </div>
              <h2 className="font-display text-2xl font-extrabold tracking-tight text-slate-900">{selected.title}</h2>
              <div className="flex flex-wrap gap-2 text-sm">
                <TypeTag type={selected.job_type} />
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">{salary(selected)}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">Remote</span>
              </div>
              <Link href={`/jobs/${selected.id}?back=${encodeURIComponent(`${query}&job=${selected.id}`)}`} className={`${button} w-full py-3 text-base`}>
                {applied.has(selected.id) ? 'View your application' : 'Apply'}
              </Link>
              <p className="whitespace-pre-line leading-relaxed text-slate-700">{selected.description}</p>
              {selected.skills.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900">Skills required</h3>
                  <Skills skills={selected.skills} />
                </div>
              )}
            </article>
          )}
        </div>
      )}
    </div>
  );
}
