'use client';
import Link from 'next/link';
import { tableCard, theadRow } from '@/components/styles';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { salary, useApi, type Job } from '@/lib/api';
import { ErrorText, TimeAgo, buttonGold } from '@/components/ui';

type MyJob = Job & { applicant_count: number; new_count: number };

// My Job Posts: every job this employer posted, open or closed, with its applicants one click away.
export default function JobPostsPage() {
  const router = useRouter();
  const { data: jobs, error } = useApi<MyJob[]>('/my/jobs');
  const { data: posts } = useApi<{ used: number; limit: number }>('/my/post-usage');
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const open = jobs?.filter((j) => !j.closed_at) ?? [];
  const closed = jobs?.filter((j) => j.closed_at) ?? [];
  const list = tab === 'open' ? open : closed;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">My Job Posts</h1>
          <p className="text-slate-500">{posts ? `${posts.used} of ${posts.limit} job posts used this month` : ' '}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/dashboard/applicants" className="rounded-lg px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-slate-200 hover:ring-emerald-600">All applicants</Link>
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs" role="group" aria-label="Show">
            {(['open', 'closed'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t}
                className={`rounded-md px-3 py-1.5 font-medium capitalize ${tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                {t} {t === 'open' ? open.length : closed.length}
              </button>
            ))}
          </div>
          <Link href="/jobs/new" className={`${buttonGold} px-4 py-1.5 text-sm`}>Post a job</Link>
        </div>
      </div>
      <ErrorText msg={error} />

      <div className={`${tableCard} overflow-x-auto`}>
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className={theadRow}>
              <th className="px-4 py-2.5 font-semibold">Job</th>
              <th className="px-2 py-2.5 font-semibold">Applicants</th>
              <th className="px-2 py-2.5 font-semibold">Posted</th>
              <th className="px-4 py-2.5 text-right font-semibold"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 [&>tr]:transition-colors [&>tr:hover]:bg-slate-50">
            {list.map((j) => (
              // The whole row opens the applicants; its own links (View, Edit…) still go where they say.
              <tr key={j.id} className="cursor-pointer" onClick={(e) => { if (!(e.target as HTMLElement).closest('a')) router.push(`/dashboard/jobs/${j.id}`); }}>
                <td className="px-4 py-3">
                  <Link href={`/dashboard/jobs/${j.id}`} className="font-semibold text-slate-900 hover:text-emerald-800">{j.title}</Link>
                  <span className="block text-xs text-slate-500">{j.job_type[0].toUpperCase() + j.job_type.slice(1)} · {salary(j)}</span>
                </td>
                <td className="px-2 py-3 tabular-nums"><b>{j.applicant_count}</b>{j.new_count > 0 && <span className="ml-1.5 text-xs font-semibold text-amber-700">+{j.new_count} this week</span>}</td>
                <td className="px-2 py-3 text-slate-500"><TimeAgo date={j.created_at} /></td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold">
                  <Link href={`/dashboard/jobs/${j.id}`} className="rounded-lg bg-emerald-950 px-2.5 py-1.5 text-white hover:bg-emerald-900">Applicants</Link>
                  <Link href={`/jobs/${j.id}`} className="ml-1 rounded-lg px-2.5 py-1.5 text-slate-600 hover:bg-slate-100">View</Link>
                  <Link href={`/jobs/${j.id}/edit`} className="rounded-lg px-2.5 py-1.5 text-slate-600 hover:bg-slate-100">Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {jobs && !list.length && (
          <p className="p-6 text-center text-slate-500">{tab === 'open' ? <>No open jobs. <Link href="/jobs/new" className="font-medium text-emerald-700 hover:underline">Post a job</Link></> : 'No closed jobs.'}</p>
        )}
        {!jobs && !error && <p className="p-6 text-center text-slate-500">Loading…</p>}
      </div>
      <p className="text-xs text-slate-500">To close or delete a job, open it with View.</p>
    </div>
  );
}
