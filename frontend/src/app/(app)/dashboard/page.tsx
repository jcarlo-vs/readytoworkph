'use client';
import Link from 'next/link';
import { useApi, salary, interest, type Credits, type Job, type Worker } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { BandStat, ErrorText, Initials, PageBand, Skills, TimeAgo, button, buttonGhost, buttonGold, card } from '@/components/ui';

type MyJob = Job & {
  applicant_count: number; new_count: number; analyzed_count: number; last_applied_at: string | null; top_applicants: string[];
};
type MyApplication = {
  id: number; credits: number; created_at: string; job_id: number; title: string; closed_at: string | null;
  employer_id: number; employer_name: string; hired: boolean; messaged: boolean;
};

export default function Dashboard() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (!user) return <p><Link href="/login?next=/dashboard" className="text-emerald-700 underline">Log in</Link> to see your dashboard.</p>;
  return user.role === 'employer' ? <EmployerDashboard /> : <WorkerDashboard />;
}

function JobCard({ job }: { job: MyJob }) {
  const extra = job.applicant_count - job.top_applicants.length;
  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border border-emerald-950/5 bg-white shadow-[0_1px_0_rgba(2,44,34,0.04),0_10px_28px_-20px_rgba(2,44,34,0.3)] sm:flex-row">
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
        className="flex flex-col justify-center gap-3 border-t border-slate-100 bg-[#f6f9f7] p-6 transition hover:bg-emerald-50/60 sm:w-64 sm:border-l sm:border-t-0">
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
  const { data: hires } = useApi<{ id: number; name: string; title: string | null; hired_at: string; job_title: string | null }[]>('/my/hires');
  const total = jobs?.reduce((n, j) => n + j.applicant_count, 0) ?? 0;
  const fresh = jobs?.reduce((n, j) => n + j.new_count, 0) ?? 0;

  return (
    <div className="space-y-8">
      <PageBand eyebrow={`Welcome back${user ? `, ${user.name.split(' ')[0]}` : ''}`} title="My Jobs"
        actions={<>
          <Link href="/dashboard/analytics" className={`${buttonGhost} gap-2`}>
            Analytics{user?.plan !== 'premium' && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-900">Premium</span>}
          </Link>
          <Link href="/jobs/new" className={`${buttonGold} gap-2`}>
            <span className="text-lg leading-none">+</span> Post a job
          </Link>
        </>}>
        {jobs && jobs.length > 0 && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <BandStat label="Active jobs" value={jobs.length} />
            <BandStat label="Applicants" value={total} hint={fresh ? `+${fresh} in the last 7 days` : 'None in the last 7 days'} gold={total > 0} />
            <BandStat label="Unread messages" value={unread?.count ?? 0} hint="Open your inbox" href="/messages" />
            <BandStat label="AI fit scores" value={usage ? (usage.remaining === null ? '∞' : usage.remaining) : '…'}
              hint={usage?.remaining === null ? 'Unlimited on Premium' : `of ${usage?.limit ?? 10} left this month`} href={usage?.remaining === 0 ? '/pricing' : undefined} />
          </div>
        )}
      </PageBand>

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

      <div className="grid gap-4 md:grid-cols-2">
        <section className={`${card} space-y-3`}>
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Your hires</h2>
            {!!hires?.length && <span className="text-xs text-slate-500">{hires.length} hired</span>}
          </div>
          {!hires?.length ? (
            <p className="text-sm text-slate-500">When you hire someone, open their profile and click <strong>Mark as hired</strong>. They&apos;ll show up here.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {hires.slice(0, 6).map((h) => (
                <li key={h.id}>
                  <Link href={`/workers/${h.id}`} className="flex items-center gap-3 py-2.5 hover:text-emerald-800">
                    <Initials name={h.name} id={h.id} size="h-9 w-9 text-xs" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-900">{h.name}</span>
                      <span className="block truncate text-xs text-slate-500">{h.job_title ?? h.title ?? 'Hired'} · <TimeAgo date={h.hired_at} /></span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className={`${card} flex flex-col justify-between gap-3`}>
          <div>
            <h2 className="font-semibold">Saved workers</h2>
            <p className="mt-1 text-sm text-slate-500">Tap ☆ Save on anyone in Hire Talent to keep a shortlist for later.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/workers?view=saved" className={`${buttonGhost} px-4 py-2`}>★ Saved workers</Link>
            <Link href="/workers" className={`${buttonGhost} px-4 py-2`}>Browse talent</Link>
          </div>
        </section>
      </div>
    </div>
  );
}

// Where an application stands, most important first.
const STATUS = {
  hired: { label: 'Hired 🎉', className: 'bg-emerald-600 text-white' },
  messaged: { label: 'Employer messaged you', className: 'bg-amber-400 text-slate-900' },
  closed: { label: 'Job closed', className: 'bg-slate-200 text-slate-600' },
  applied: { label: 'Applied', className: 'bg-slate-100 text-slate-700' },
};
const statusOf = (a: MyApplication) => (a.hired ? 'hired' : a.messaged ? 'messaged' : a.closed_at ? 'closed' : 'applied');

function WorkerDashboard() {
  const { user } = useAuth();
  const { data: apps, error } = useApi<MyApplication[]>('/my/applications');
  const { data: credits } = useApi<Credits>('/credits');
  const { data: unread } = useApi<{ count: number }>('/messages/unread-count');
  const { data: profile } = useApi<Worker>(user ? `/workers/${user.id}` : null);
  const { data: resume } = useApi<{ resume: unknown }>('/profile/resume');

  // Profile checklist: what makes employers pick (and the AI score) better. Hidden once complete.
  const todo = profile && resume ? [
    [!!profile.title, 'Add a professional title'],
    [profile.skills.length >= 3, 'Add at least 3 skills'],
    [!!profile.hourly_rate, 'Set your hourly rate'],
    [(profile.bio ?? '').length >= 80, 'Write a short bio about your experience'],
    [!!resume.resume, 'Upload your resume (PDF)'],
    [!!user?.has_photo, 'Add a profile photo'],
  ] as const : null;
  const done = todo?.filter(([ok]) => ok).length ?? 0;
  const hired = apps?.filter((a) => a.hired).length ?? 0;
  const replies = apps?.filter((a) => a.messaged && !a.hired).length ?? 0;

  return (
    <div className="space-y-8">
      <PageBand title={<>Hi, {user?.name.split(' ')[0]} 👋</>} sub="Here’s how your job search is going."
        actions={<Link href="/jobs" className={buttonGold}>Find jobs</Link>}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <BandStat label="Credits left today" value={credits ? `${credits.remaining}/${credits.daily}` : '-'} hint="Refills at midnight" href="/jobs" gold />
          <BandStat label="Applications" value={apps?.length ?? '-'} hint={replies ? `${replies} with a reply` : 'All time'} />
          <BandStat label="Unread messages" value={unread?.count ?? '-'} hint="From employers" href="/messages" />
          <BandStat label="Hired" value={hired} hint={hired ? 'Congratulations!' : 'Keep applying'} />
        </div>
      </PageBand>

      {todo && done < todo.length && (
        <section className={`${card} space-y-4 p-6`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold">Complete your profile</h2>
              <p className="text-sm text-slate-600">Complete profiles get more replies and higher AI Fit Scores.</p>
            </div>
            <Link href="/profile" className={`${buttonGhost} px-4 py-2`}>Edit profile</Link>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={todo.length} aria-label="Profile completeness">
            <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${(done / todo.length) * 100}%` }} />
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {todo.map(([ok, label]) => (
              <li key={label} className={`flex items-center gap-2 text-sm ${ok ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs ${ok ? 'bg-emerald-600 text-white' : 'border border-slate-300'}`}>{ok ? '✓' : ''}</span>
                {ok ? label : <Link href="/profile" className="hover:text-emerald-700 hover:underline">{label}</Link>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">My applications</h2>
        <ErrorText msg={error} />
        {apps?.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
            <p className="font-semibold text-slate-800">No applications yet</p>
            <p className="mt-1 text-sm text-slate-500">You have {credits?.remaining ?? 60} Credits today. Spend more on the jobs you want most to show up higher.</p>
            <Link href="/jobs" className={`${button} mt-4 inline-block px-5 py-2.5`}>Browse jobs</Link>
          </div>
        )}
        <ul className="space-y-3">
          {apps?.map((a) => {
            const s = STATUS[statusOf(a)];
            return (
              <li key={a.id} className={`${card} flex flex-wrap items-center gap-4`}>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/jobs/${a.job_id}`} className="font-semibold text-slate-900 hover:text-emerald-700 hover:underline">{a.title}</Link>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.className}`}>{s.label}</span>
                  </div>
                  <p className="text-sm text-slate-500">
                    {a.employer_name} · applied <TimeAgo date={a.created_at} /> ·{' '}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${interest(a.credits).className}`}>⚡ {a.credits} credit{a.credits === 1 ? '' : 's'}</span>
                  </p>
                </div>
                {a.messaged
                  ? <Link href={`/messages?with=${a.employer_id}`} className={`${button} px-4 py-2`}>Open chat</Link>
                  : <Link href={`/jobs/${a.job_id}`} className={`${buttonGhost} px-4 py-2`}>View job</Link>}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
