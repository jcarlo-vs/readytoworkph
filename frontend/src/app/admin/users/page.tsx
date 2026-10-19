'use client';
import { useEffect, useState } from 'react';
import { ErrorText, card } from '@/components/ui';
import { PLAN_PILL, PageHeader, Pager, Search, Seg, adminApi, ago, date, failed, flag, pill, td, th, useAdmin } from '../ui';

type User = {
  id: number; name: string; email: string; role: 'worker' | 'employer'; plan: string; created_at: string; last_seen_at: string | null;
  last_country: string | null; google: boolean; jobs: number; applications: number;
};

// Everyone who signed up, newest first: search by name or email, filter by type and plan, 25 per page.
export default function Users() {
  const { logout } = useAdmin();
  const [q, setQ] = useState('');
  const [role, setRole] = useState<'' | 'worker' | 'employer'>('');
  const [plan, setPlan] = useState<'' | 'free' | 'pro' | 'premium'>('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ users: User[]; total: number; page_size: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams({ q, role, plan: role === 'worker' ? '' : plan, page: String(page) });
      adminApi<typeof data>(`/users?${params}`).then(setData, failed(logout, setError));
    }, q ? 250 : 0); // wait for typing to pause before searching
    return () => clearTimeout(t);
  }, [q, role, plan, page, logout]);

  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(0); };
  return (
    <>
      <PageHeader title="Users" sub={data ? `${data.total.toLocaleString('en-US')} ${role ? `${role}s` : 'people'}${q ? ` matching "${q}"` : ''}` : ' '}>
        <Search value={q} onChange={reset(setQ)} placeholder="Search name or email" />
      </PageHeader>
      <div className="flex flex-wrap gap-2">
        <Seg label="Type" value={role} onChange={reset(setRole)} options={[['', 'Everyone'], ['worker', 'Workers'], ['employer', 'Employers']]} />
        {role !== 'worker' && <Seg label="Plan" value={plan} onChange={reset(setPlan)} options={[['', 'Any plan'], ['free', 'Free'], ['pro', 'Pro'], ['premium', 'Premium']]} />}
      </div>
      <ErrorText msg={error} />
      <section className={`${card} overflow-x-auto p-0`}>
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-slate-200">
            <tr><th className={th}>Person</th><th className={th}>Type</th><th className={th}>Activity</th><th className={th}>Joined</th><th className={th}>Last active</th><th className={th}>Country</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!data && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>}
            {data?.users.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No one matches.</td></tr>}
            {data?.users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className={td}>
                  <span className="block font-medium text-slate-900">{u.name}</span>
                  <span className="block select-all text-xs text-slate-500">{u.email}{u.google && ' · Google'}</span>
                </td>
                <td className={td}>
                  <span className="flex flex-wrap gap-1">
                    <span className={`${pill} ${u.role === 'employer' ? 'bg-sky-50 text-sky-800' : 'bg-violet-50 text-violet-800'}`}>{u.role}</span>
                    {u.role === 'employer' && <span className={`${pill} ${PLAN_PILL[u.plan]}`}>{u.plan}</span>}
                  </span>
                </td>
                <td className={`${td} tabular-nums text-slate-600`}>{u.role === 'employer' ? `${u.jobs} job${u.jobs === 1 ? '' : 's'}` : `${u.applications} application${u.applications === 1 ? '' : 's'}`}</td>
                <td className={`${td} whitespace-nowrap text-slate-600`}>{date(u.created_at)}</td>
                <td className={`${td} text-slate-600`}>{ago(u.last_seen_at)}</td>
                <td className={`${td} text-slate-600`}>{u.last_country ? `${flag(u.last_country)} ${u.last_country}` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {data && <Pager page={page} total={data.total} size={data.page_size} onPage={setPage} noun="users" />}
    </>
  );
}
