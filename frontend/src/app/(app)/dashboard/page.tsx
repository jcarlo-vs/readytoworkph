'use client';
import Link from 'next/link';
import { useApi, salary, interest, type Credits, type Job, type Worker } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { BandStat, ErrorText, PageBand, TimeAgo, button, buttonGhost, buttonGold, card } from '@/components/ui';

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

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

// One to-do tile: a number, what it is, and where to go about it.
function Todo({ href, label, value, action, warm }: { href: string; label: string; value: React.ReactNode; action: string; warm?: boolean }) {
  return (
    <Link href={href} className={`rounded-xl px-4 py-3.5 transition ${warm ? 'bg-amber-50 text-amber-900 hover:bg-amber-100' : 'bg-white text-slate-600 ring-1 ring-slate-200/80 hover:ring-emerald-600'}`}>
      <span className="block text-xs">{label}</span>
      <b className="block text-2xl text-slate-900 tabular-nums">{value}</b>
      <span className="block text-xs">{action}</span>
    </Link>
  );
}

// Employer home: what needs them today, then their open job posts. Applicants, hires and saved
// workers have their own pages in the side menu.
function EmployerDashboard() {
  const { user } = useAuth();
  const { data: jobs, error } = useApi<MyJob[]>('/my/jobs');
  const { data: fresh } = useApi<{ count: number }>('/my/new-applicants');
  const { data: unread } = useApi<{ count: number }>('/messages/unread-count');
  const { data: posts } = useApi<{ used: number; limit: number }>('/my/post-usage');
  const open = jobs?.filter((j) => !j.closed_at) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{greeting()}{user ? `, ${user.name.split(' ')[0]}` : ''}</h1>
        <p className="text-slate-500">Here&apos;s what needs you today.</p>
      </div>
      <ErrorText msg={error} />

      {jobs?.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-white px-6 py-12 text-center ring-1 ring-slate-200/80">
          <h2 className="text-lg font-semibold">Post your first job</h2>
          <p className="max-w-md text-slate-500">Describe the role and budget, and Filipino professionals will start applying. You can also browse talent and message them directly.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/jobs/new" className={`${buttonGold} px-4 py-2 text-sm`}>Post a job</Link>
            <Link href="/workers" className={`${buttonGhost} px-4 py-2 text-sm`}>Browse talent</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Todo href="/dashboard/applicants" label="New applicants" value={fresh?.count ?? '…'} action={fresh?.count ? 'Review now ›' : 'All caught up'} warm={!!fresh?.count} />
            <Todo href="/messages" label="Unread messages" value={unread?.count ?? '…'} action="Open inbox ›" />
            <Todo href="/dashboard/jobs" label="Open job posts" value={jobs ? open.length : '…'} action={posts ? `${posts.used} of ${posts.limit} posts used this month` : ' '} />
          </div>

          <section>
            <div className="flex items-baseline justify-between border-b border-slate-200 pb-2">
              <h2 className="font-semibold text-slate-900">Open job posts</h2>
              <Link href="/dashboard/jobs" className="text-xs font-semibold text-emerald-700 hover:underline">See all</Link>
            </div>
            {open.length === 0 && jobs && <p className="py-4 text-slate-500">No open jobs. <Link href="/jobs/new" className="font-medium text-emerald-700 hover:underline">Post a job</Link></p>}
            <ul className="divide-y divide-slate-100">
              {open.slice(0, 6).map((j) => (
                <li key={j.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                  <div className="min-w-0 flex-1 basis-60">
                    <Link href={`/dashboard/jobs/${j.id}`} className="block truncate font-semibold text-slate-900 hover:text-emerald-800">{j.title}</Link>
                    <p className="truncate text-xs text-slate-500">{j.job_type[0].toUpperCase() + j.job_type.slice(1)} · {salary(j)} · Posted <TimeAgo date={j.created_at} /></p>
                  </div>
                  <span className="w-36 text-sm text-slate-600"><b className="text-slate-900 tabular-nums">{j.applicant_count}</b> applicant{j.applicant_count === 1 ? '' : 's'}{j.new_count > 0 && <span className="font-semibold text-amber-700"> +{j.new_count}</span>}</span>
                  <Link href={`/dashboard/jobs/${j.id}`} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:ring-emerald-600">Applicants</Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
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

  // Profile checklist: what makes employers pick (and the Smart Score) better. Hidden once complete.
  const todo = profile && resume ? [
    [!!profile.title, 'Add a professional title'],
    [!!profile.birth_date && !!profile.gender, 'Add your birth date and gender (required)'],
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
              <p className="text-sm text-slate-600">Complete profiles get more replies and higher Smart Scores.</p>
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
