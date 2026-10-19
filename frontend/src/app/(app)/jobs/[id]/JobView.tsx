'use client';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useApi, salary, interest, type Job } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Skills, ErrorText, LoadError, Initials, BackButton, TimeAgo, button, card } from '@/components/ui';
import { postDate } from '@/lib/time';
import { ApplyPanel } from '@/components/ApplyPanel';
import { JobOwnerActions } from '@/components/JobOwnerActions';

const Meta = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0 rounded-xl bg-slate-50 px-4 py-3">
    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className="mt-0.5 truncate font-semibold text-slate-900">{value}</dd>
  </div>
);

type ApplicantPreview = {
  id: number; worker_id: number; name: string; title: string | null; credits: number; created_at: string;
  analysis: { score: number } | null;
};

const PREVIEW = 3;
const scoreTone = (s: number) => (s >= 85 ? 'bg-emerald-100 text-emerald-800' : s >= 65 ? 'bg-emerald-50 text-emerald-700' : s >= 40 ? 'bg-amber-100 text-amber-800' : 'bg-red-50 text-red-700');

// What the job's owner sees in the sidebar: a ranked preview of who applied, with a clear way into the full list.
function OwnerApplicants({ jobId }: { jobId: number }) {
  const { data, error } = useApi<{ applicants: ApplicantPreview[]; total: number }>(`/jobs/${jobId}/applications`);
  const apps = data?.applicants;
  const all = `/dashboard/jobs/${jobId}`;
  if (error) return <ErrorText msg={error} />;
  if (!apps) return <p className="text-sm text-slate-500">Loading applicants…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Applicants</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-sm font-bold ${data!.total ? 'bg-amber-400 text-slate-900' : 'bg-slate-100 text-slate-500'}`}>{data!.total}</span>
      </div>

      {apps.length === 0 ? (
        <div className="space-y-1 rounded-xl border border-dashed border-slate-300 p-5 text-center">
          <p className="font-medium text-slate-700">No applicants yet</p>
          <p className="text-sm text-slate-500">New applications will show up here. Workers who bid more Credits appear first.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-500">Top applicants by Credits bid</p>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {apps.slice(0, PREVIEW).map((a) => (
              <li key={a.id}>
                <Link href={`${all}#applicant-${a.id}`} className="flex items-center gap-3 px-3 py-3 transition hover:bg-slate-50">
                  <Initials name={a.name} id={a.worker_id} size="h-10 w-10 text-sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">{a.name}</span>
                    <span className="block truncate text-xs text-slate-500">{a.title || 'No title'} · <TimeAgo date={a.created_at} /></span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${interest(a.credits).className}`}>⚡ {a.credits}</span>
                    {a.analysis && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${scoreTone(a.analysis.score)}`}>AI {a.analysis.score}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <Link href={all} className={`${button} w-full gap-2 py-3`}>
        {data!.total > PREVIEW ? `View all ${data!.total} applicants` : apps.length ? 'Review applicants' : 'Open applicants page'}
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 5l5 5-5 5" /></svg>
      </Link>
      {apps.length > 0 && <p className="text-center text-xs text-slate-500">Message applicants and get their AI fit scores.</p>}
    </div>
  );
}

// The interactive job page. The server already loaded the job (as a visitor sees it, for Google);
// it's fetched again here so members see full details and owners get their controls.
export function JobView({ initial }: { initial: Job }) {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data: job, error, status, reload } = useApi<Job>(`/jobs/${id}`, undefined, initial);

  // Opened from search results: go back to that same search (re-encoded, so it can only ever be a /jobs search).
  const fromSearch = useSearchParams().get('back');
  const back = fromSearch ? new URLSearchParams(fromSearch).toString() : '';
  if (error && !job) return <LoadError msg={error} status={status} onRetry={reload} />;
  if (!job) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {user?.id === job.employer_id
          ? <BackButton href="/dashboard">My Jobs</BackButton>
          : back ? <BackButton href={`/jobs?${back}`}>Back to results</BackButton> : <BackButton href="/jobs">All jobs</BackButton>}
        {user?.id === job.employer_id && <JobOwnerActions job={job} onChange={reload} />}
      </div>

      {job.closed_at && (
        <div role="status" className="flex items-center gap-3 rounded-xl border border-slate-300 bg-slate-100 px-5 py-4">
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          <div>
            <p className="font-semibold text-slate-900">This job is closed</p>
            <p className="text-sm text-slate-600">
              {user?.id === job.employer_id
                ? <>It&apos;s hidden from search and not taking applications. Your applicants are still here.</>
                : <>The employer is no longer accepting applications.</>}
            </p>
          </div>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <article className={`${card} space-y-8 p-8`}>
          <header className="space-y-5">
            <div className="flex items-center gap-3">
              <Initials name={job.employer_name} id={job.employer_id} size="h-11 w-11 text-sm" />
              <div>
                <p className="font-semibold text-slate-900">{job.employer_name}</p>
                <p className="text-sm text-slate-500">
                  Posted {postDate(job.created_at)} · <span className="font-medium text-emerald-800"><TimeAgo date={job.created_at} /></span>
                  {job.updated_at && <> · Updated <TimeAgo date={job.updated_at} /></>}
                </p>
              </div>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">{job.title}</h1>
            <dl className="grid gap-3 sm:grid-cols-3">
              <Meta label="Job type" value={job.job_type[0].toUpperCase() + job.job_type.slice(1)} />
              <Meta label="Salary" value={salary(job)} />
              <Meta label="Location" value="Remote" />
            </dl>
          </header>

          <section className="space-y-3 border-t border-slate-100 pt-6">
            <h2 className="text-lg font-semibold">About the job</h2>
            <p className="whitespace-pre-line leading-relaxed text-slate-700">{job.description}</p>
            {/* The server hides email addresses from visitors; tell them how to see them. */}
            {!user && /\[email hidden/.test(job.title + job.description) && (
              <p className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                <span>Contact details are only shown to members. <Link href={`/login?next=/jobs/${job.id}`} className="font-semibold text-emerald-700 hover:underline">Log in</Link> or <Link href={`/register?next=/jobs/${job.id}`} className="font-semibold text-emerald-700 hover:underline">sign up free</Link> to see them.</span>
              </p>
            )}
          </section>

          {job.skills.length > 0 && (
            <section className="space-y-3 border-t border-slate-100 pt-6">
              <h2 className="text-lg font-semibold">Skills required</h2>
              <Skills skills={job.skills} />
            </section>
          )}
        </article>

        <aside className={`${card} space-y-4 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto`}>
          {!user && job.closed_at && <p className="text-sm text-slate-600">This job is no longer accepting applications.</p>}
          {!user && !job.closed_at && (
            <>
              <h2 className="text-lg font-semibold">Interested in this job?</h2>
              <p className="text-sm text-slate-500">Log in or create a free profile to apply.</p>
              <Link href={`/login?next=/jobs/${job.id}`} className={`${button} w-full py-3`}>Log in to apply</Link>
              <Link href={`/register?role=worker&next=/jobs/${job.id}`} className="block text-center text-sm font-medium text-emerald-800 hover:underline">Create a free profile</Link>
            </>
          )}
          {user?.role === 'worker' && <ApplyPanel jobId={job.id} closed={!!job.closed_at} />}
          {user?.role === 'employer' && (user.id === job.employer_id
            ? <OwnerApplicants jobId={job.id} />
            : <p className="text-sm text-slate-500">You&apos;re signed in as an employer. Use a worker account to apply.</p>)}
        </aside>
      </div>
    </div>
  );
}
