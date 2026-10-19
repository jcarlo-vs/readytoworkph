'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, useApi, type Job } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { JobForm } from '@/components/JobForm';
import { button, buttonGhost, card } from '@/components/ui';

export default function NewJobPage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  if (!ready) return <p className="text-slate-500">Loading…</p>;
  // Visitors (from the Post a Job button) sign up or log in as an employer, then come straight back here.
  if (!user) {
    return (
      <div className={`${card} mx-auto max-w-xl space-y-4 p-10 text-center`}>
        <h1 className="font-display text-2xl font-bold text-slate-900">Post your first job free</h1>
        <p className="text-slate-600">Create a free employer account to post your job and start receiving applications from skilled Filipino professionals.</p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Link href="/register?role=employer&next=/jobs/new" className={button}>Sign up as an employer</Link>
          <Link href="/login?next=/jobs/new" className={buttonGhost}>Log in</Link>
        </div>
      </div>
    );
  }
  if (user.role !== 'employer') {
    return (
      <div className={`${card} mx-auto max-w-xl space-y-3 p-10 text-center`}>
        <h1 className="font-display text-2xl font-bold text-slate-900">Posting jobs is for employers</h1>
        <p className="text-slate-600">You&apos;re signed in with a worker account. To hire, log out and create a separate employer account.</p>
        <Link href="/jobs" className={`${buttonGhost} mt-2`}>Find jobs instead</Link>
      </div>
    );
  }
  return <EmployerNewJob onPosted={(job) => router.push(`/jobs/${job.id}`)} />;
}

// Each plan includes a number of job posts a month; when they're used up, say so before the form, not after.
function EmployerNewJob({ onPosted }: { onPosted: (job: Job) => void }) {
  const { user } = useAuth();
  const { data: quota } = useApi<{ plan: string; remaining: number; limit: number; message: string | null }>('/my/job-quota');
  if (user?.email_verified === false) {
    return (
      <div className={`${card} mx-auto max-w-xl space-y-4 p-10 text-center`}>
        <h1 className="font-display text-2xl font-bold text-slate-900">Confirm your email to post a job</h1>
        <p className="text-slate-600">We sent a link to <b>{user.email}</b>. Click it, then come back here. It keeps fake job posts off ReadyToWork.ph. No email? Use “Send a new link” in the yellow bar above.</p>
      </div>
    );
  }
  if (quota?.message) {
    return (
      <div className={`${card} mx-auto max-w-xl space-y-4 p-10 text-center`}>
        <h1 className="font-display text-2xl font-bold text-slate-900">You&apos;ve used this month&apos;s job posts</h1>
        <p className="text-slate-600">{quota.message}</p>
        {quota.plan !== 'premium' && <Link href="/pricing" className={button}>See plans</Link>}
      </div>
    );
  }
  return (
    <JobForm heading="Post a job" submitLabel="Post job"
      notice={quota && <p>{quota.remaining} of {quota.limit} job posts left this month.</p>}
      onSubmit={async (form) => onPosted(await api<Job>('/jobs', { body: form }))} />
  );
}
