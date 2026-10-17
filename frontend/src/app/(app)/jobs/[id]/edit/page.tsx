'use client';
import { useParams, useRouter } from 'next/navigation';
import { api, useApi, type Job } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { BackButton, ErrorText } from '@/components/ui';
import { JobForm } from '@/components/JobForm';

export default function EditJobPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, ready } = useAuth();
  const { data: job, error } = useApi<Job>(`/jobs/${id}`);
  const owner = !!job && user?.id === job.employer_id;
  const { data: applicants } = useApi<unknown[]>(owner ? `/jobs/${id}/applications` : null);

  if (error) return <ErrorText msg={error} />;
  if (!job || !ready) return <p className="text-slate-500">Loading…</p>;
  if (!owner) return <p>Only the employer who posted this job can edit it.</p>;

  return (
    <div className="space-y-6">
      <BackButton href={`/jobs/${job.id}`}>Back to job</BackButton>
      <JobForm job={job} heading="Edit job" submitLabel="Save changes"
        notice={!!applicants?.length && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            {applicants.length} {applicants.length === 1 ? 'person has' : 'people have'} already applied to the earlier version.
            Their applications and AI scores stay as they are, and the job will show &quot;Updated&quot;.
          </p>
        )}
        onSubmit={async (form) => {
          await api(`/jobs/${job.id}`, { method: 'PUT', body: form });
          router.push(`/jobs/${job.id}`);
        }} />
    </div>
  );
}
