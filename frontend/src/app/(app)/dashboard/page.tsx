'use client';
import Link from 'next/link';
import { useApi, salary, type Job } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ErrorText, Initials, Skills, TimeAgo, button, buttonGhost, buttonGold, card } from '@/components/ui';

type MyJob = Job & {
  applicant_count: number; new_count: number; analyzed_count: number; last_applied_at: string | null; top_applicants: string[];
};
type MyApplication = { id: number; credits: number; created_at: string; job_id: number; title: string; employer_name: string };

export default function Dashboard() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (!user) return <p><Link href="/login" className="text-emerald-700 underline">Log in</Link> to see your dashboard.</p>;
  return user.role === 'employer' ? <EmployerDashboard /> : <WorkerDashboard />;
}

function Stat({ label, value, hint, href, tone = 'text-slate-900' }: { label: string; value: React.ReactNode; hint?: string; href?: string; tone?: string }) {
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${tone}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </>
  );
  return href
    ? <Link href={href} className={`${card} block p-5 transition hover:border-emerald-600 hover:shadow-md`}>{body}</Link>
    : <div className={`${card} p-5`}>{body}</div>;
}

function JobCard({ job }: { job: MyJob }) {
  const extra = job.applicant_count - job.top_applicants.length;
  return (
    <li className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:flex-row">
      <div className="min-w-0 flex-1 space-y-3 p-6">
        <div className="flex flex-wrap items-center gap-2">
          {job.closed_at && <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-white">Closed</span>}
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">{job.job_type[0].toUpperCase() + job.job_type.slice(1)}</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">{salary(job)}</span>
          <span className="text-xs text-slate-500">Posted <TimeAgo date={job.created_at} /></span>
        </div>
        <Link href={`/jobs/${job.id}`} className="block text-lg font-semibold text-slate-900 hover:text-emerald-800">{job.title}</Link>
        <Skills skills={job.skills.slice(0, 5)} />
        <div className="flex flex-wrap gap-2 pt-1">
          <Link href={`/dashboard/jobs/${job.id}`} className={`${button} px-4 py-2`}>Review applicants</Link>
          <Link href={`/jobs/${job.id}`} className={`${buttonGhost} px-4 py-2`}>View post</Link>
          <Link href={`/jobs/${job.id}/edit`} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Edit</Link>
        </div>
      </div>

      <Link href={`/dashboard/jobs/${job.id}`}
        className="flex flex-col justify-center gap-3 border-t border-slate-100 bg-slate-50/70 p-6 transition hover:bg-emerald-50/60 sm:w-64 sm:border-l sm:border-t-0">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold text-slate-900">{job.applicant_count}</span>
          <span className="text-sm text-slate-500">applicant{job.applicant_count === 1 ? '' : 's'}</span>
        </div>
        {job.new_count > 0 && (
          <span className="self-start rounded-full bg-amber-400 px-2.5 py-0.5 text-xs font-bold text-slate-900">+{job.new_count} new this week</span>
        )}
        {job.applicant_count > 0 ? (
          <div className="flex items-center">
            {job.top_applicants.map((name, i) => (
              <span key={i} className="-ml-1.5 first:ml-0 rounded-full ring-2 ring-white"><Initials name={name} size="h-9 w-9 text-xs" /></span>
            ))}
            {extra > 0 && <span className="-ml-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700 ring-2 ring-white">+{extra}</span>}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No applicants yet</p>
        )}
        <p className="text-xs text-slate-500">
          {job.last_applied_at ? <>Latest application · <TimeAgo date={job.last_applied_at} /></> : 'Waiting for the first application'}
          {job.analyzed_count > 0 && <> · {job.analyzed_count} AI-scored</>}
        </p>
      </Link>
    </li>
  );
}

function EmployerDashboard() {
  const { user } = useAuth();
  const { data: jobs, error } = useApi<MyJob[]>('/my/jobs');
  const { data: unread } = useApi<{ count: number }>('/messages/unread-count');
  const { data: usage } = useApi<{ plan: string; remaining: number | null; limit: number }>('/analyzer/usage');
  const total = jobs?.reduce((n, j) => n + j.applicant_count, 0) ?? 0;
  const fresh = jobs?.reduce((n, j) => n + j.new_count, 0) ?? 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-emerald-800">Welcome back{user ? `, ${user.name.split(' ')[0]}` : ''}</p>
          <h1 className="text-3xl font-bold tracking-tight">My Jobs</h1>
        </div>
        <Link href="/jobs/new" className={`${buttonGold} gap-2`}>
          <span className="text-lg leading-none">+</span> Post a job
        </Link>
      </div>

      {jobs && jobs.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Active jobs" value={jobs.length} />
          <Stat label="Applicants" value={total} hint={fresh ? `+${fresh} in the last 7 days` : 'None in the last 7 days'} tone={total ? 'text-emerald-800' : 'text-slate-900'} />
          <Stat label="Unread messages" value={unread?.count ?? 0} hint="Open your inbox" href="/messages" tone={unread?.count ? 'text-amber-600' : 'text-slate-900'} />
          <Stat label="AI analyses" value={usage ? (usage.remaining === null ? '∞' : usage.remaining) : '…'}
            hint={usage?.remaining === null ? 'Premium · unlimited' : `of ${usage?.limit ?? 10} free left`} href={usage?.remaining === 0 ? '/premium' : undefined} />
        </div>
      )}

      <ErrorText msg={error} />
      {jobs?.length === 0 && (
        <div className={`${card} flex flex-col items-center gap-4 px-6 py-14 text-center`}>
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-950 text-amber-300" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h16v11H4zM9 8V5h6v3M4 13h16" /></svg>
          </span>
          <div>
            <h2 className="text-xl font-semibold">Post your first job</h2>
            <p className="mt-1 max-w-md text-slate-500">Describe the role and budget, and Filipino professionals will start applying. You can also browse talent and message them directly.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/jobs/new" className={buttonGold}>Post a job</Link>
            <Link href="/workers" className={buttonGhost}>Browse talent</Link>
          </div>
        </div>
      )}
      {!!jobs?.length && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Your job posts</h2>
          <ul className="space-y-4">{jobs.map((j) => <JobCard key={j.id} job={j} />)}</ul>
        </section>
      )}
    </div>
  );
}

function WorkerDashboard() {
  const { data: apps, error } = useApi<MyApplication[]>('/my/applications');
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">My Applications</h1>
      <ErrorText msg={error} />
      {apps?.length === 0 && <p className="text-slate-500">No applications yet. <Link href="/" className="text-emerald-700">Browse jobs</Link></p>}
      <ul className="space-y-3">
        {apps?.map((a) => (
          <li key={a.id} className={card}>
            <Link href={`/jobs/${a.job_id}`} className="font-semibold text-emerald-700 hover:underline">{a.title}</Link>
            <p className="text-sm text-slate-500">{a.employer_name} · applied <TimeAgo date={a.created_at} /> · ⚡ {a.credits} credit{a.credits === 1 ? '' : 's'}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
