'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, type Job } from '@/lib/api';
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
  return (
    <JobForm heading="Post a job" submitLabel="Post job" onSubmit={async (form) => {
      const job = await api<Job>('/jobs', { body: form });
      router.push(`/jobs/${job.id}`);
    }} />
  );
}
