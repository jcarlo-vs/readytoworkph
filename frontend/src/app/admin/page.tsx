'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ErrorText, card } from '@/components/ui';
import { PageHeader, adminApi, ago, countryName, failed, flag, td, th, useAdmin } from './ui';

type Stats = {
  totals: Record<string, number>;
  signups: { day: string; workers: number; employers: number }[];
  countries: { country: string; users: number }[];
  recent: { id: number; name: string; role: string; created_at: string; last_seen_at: string | null; last_country: string | null }[];
};

// Cloudflare already sees every visit: anonymous visitors, countries and IP addresses live there, not in our database.
const CF = 'https://dash.cloudflare.com/fc01f569de407b67f5104d71ee8acde3';

// The admin's home: four headline numbers, sign-ups over time, what needs attention, then the detail.
// Refreshes every minute.
export default function Overview() {
  const { logout } = useAdmin();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const load = () => adminApi<Stats>('/stats').then(setStats, failed(logout, setError));
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [logout]);

  if (error && !stats) return <div className={card}><ErrorText msg={error} /></div>;
  if (!stats) return <p className="text-slate-500">Loading overview…</p>;
  const t = stats.totals;
  const peak = Math.max(1, ...stats.signups.map((d) => d.workers + d.employers));
  const topCountry = Math.max(1, ...stats.countries.map((c) => c.users));
  const kpis: [string, number, React.ReactNode][] = [
    ['Users', t.users, <span key="u"><span className="font-semibold text-emerald-700">+{t.new_7d}</span> in 7 days · {t.workers} workers, {t.employers} employers</span>],
    ['Active today', t.active_24h, <span key="a">{t.active_now} right now · {t.active_7d} this week</span>],
    ['Open jobs', t.open_jobs, <span key="j"><span className="font-semibold text-emerald-700">+{t.jobs_7d}</span> posted in 7 days</span>],
    ['Paying employers', t.paid_employers, <Link key="p" href="/admin/subscriptions" className="text-emerald-700 hover:underline">See subscriptions ›</Link>],
  ];
  const groups: [string, [string, number][]][] = [
    ['Workers', [['Completed profiles', t.profiles_completed], ['Uploaded a resume', t.resumes], ['Applied to a job', t.workers_applied], ['Applications', t.applications], ['Applications, last 7 days', t.applications_7d]]],
    ['Employers & jobs', [['Posted a job', t.employers_posted], ['Job posts', t.jobs], ['AI fit scores', t.ai_analyses], ['AI fit scores, last 7 days', t.ai_analyses_7d]]],
    ['People & messages', [['New, last 24 hours', t.new_24h], ['Signed up with Google', t.google_users], ['Messages sent', t.messages], ['Messages, last 7 days', t.messages_7d]]],
  ];
  const attention: [string, number, string][] = [
    ['Open feedback', t.open_feedback, '/admin/feedback'],
  ];

  return (
    <>
      <PageHeader title="Overview" sub="Updates every minute">
        <a href={`${CF}/web-analytics`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-emerald-600">Visitors &amp; countries ↗</a>
        <a href={`${CF}/readytowork.ph/security/analytics`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-emerald-600">IPs &amp; blocked traffic ↗</a>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(([label, value, hint]) => (
          <div key={label} className={`${card} p-5`}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 font-display text-3xl font-bold tabular-nums text-slate-900">{value.toLocaleString('en-US')}</p>
            <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className={card}>
          <div className="flex items-baseline justify-between"><h2 className="font-semibold">Sign-ups per day</h2><span className="text-xs text-slate-500">last 30 days</span></div>
          <div className="mt-4 flex h-40 items-end gap-0.5 border-b border-slate-300" role="img" aria-label="Daily sign-ups for the last 30 days">
            {stats.signups.map((d) => (
              <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end">
                <div className="rounded-t-sm bg-amber-400" style={{ height: `${(d.employers / peak) * 100}%` }} />
                <div className={d.employers ? '' : 'rounded-t-sm'} style={{ height: `${(d.workers / peak) * 100}%`, background: '#047857' }} />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white group-hover:block">
                  {d.day}: {d.workers} workers, {d.employers} employers
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-slate-400"><span>{stats.signups[0]?.day}</span><span>Today</span></div>
          <p className="mt-3 flex gap-4 text-xs text-slate-600">
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-700" />Workers</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-400" />Employers</span>
          </p>
        </section>
        <section className={`${card} space-y-1`}>
          <h2 className="mb-2 font-semibold">Needs attention</h2>
          {attention.map(([label, n, href]) => (
            <Link key={label} href={href} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-slate-50">
              <span className="flex-1 text-sm text-slate-700">{label}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${n ? 'bg-amber-400 text-slate-900' : 'bg-slate-100 text-slate-500'}`}>{n}</span>
              <span className="text-slate-400" aria-hidden="true">›</span>
            </Link>
          ))}
          <Link href="/admin/subscriptions" className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-slate-50">
            <span className="flex-1 text-sm text-slate-700">Failed payments &amp; cancellations</span>
            <span className="text-xs text-slate-500">Check</span><span className="text-slate-400" aria-hidden="true">›</span>
          </Link>
          {!t.open_feedback && <p className="px-2 pt-2 text-xs text-slate-500">All caught up.</p>}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {groups.map(([title, rows]) => (
          <section key={title} className={card}>
            <h2 className="mb-2 font-semibold">{title}</h2>
            <dl className="divide-y divide-slate-100 text-sm">
              {rows.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 py-2"><dt className="text-slate-500">{label}</dt><dd className="font-semibold tabular-nums text-slate-900">{value.toLocaleString('en-US')}</dd></div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className={`${card} overflow-x-auto p-0`}>
          <div className="flex items-baseline justify-between px-4 pt-4"><h2 className="font-semibold">Latest sign-ups</h2><Link href="/admin/users" className="text-sm text-emerald-700 hover:underline">All users ›</Link></div>
          <table className="mt-2 w-full min-w-[520px] text-sm">
            <thead className="border-b border-slate-200"><tr><th className={th}>Name</th><th className={th}>Type</th><th className={th}>Joined</th><th className={th}>Last active</th><th className={th}>Country</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {stats.recent.map((u) => (
                <tr key={u.id}>
                  <td className={`${td} font-medium text-slate-900`}>{u.name}</td>
                  <td className={`${td} capitalize text-slate-600`}>{u.role}</td>
                  <td className={`${td} text-slate-600`}>{ago(u.created_at)}</td>
                  <td className={`${td} text-slate-600`}>{ago(u.last_seen_at)}</td>
                  <td className={`${td} text-slate-600`}>{u.last_country ? `${flag(u.last_country)} ${u.last_country}` : 'Unknown'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className={card}>
          <h2 className="font-semibold">Users by country</h2>
          <p className="text-xs text-slate-500">Signed-in users active in the last 30 days</p>
          {stats.countries.length ? (
            <ul className="mt-4 space-y-2 text-sm">
              {stats.countries.map((c) => (
                <li key={c.country}>
                  <div className="flex justify-between"><span>{flag(c.country)} {countryName(c.country)}</span><span className="font-semibold">{c.users}</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${(c.users / topCountry) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          ) : <p className="mt-4 text-sm text-slate-500">No activity yet.</p>}
        </section>
      </div>
    </>
  );
}
