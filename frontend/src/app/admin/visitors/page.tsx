'use client';
import { useEffect, useState } from 'react';
import { ErrorText, card } from '@/components/ui';
import { PageHeader, Pager, adminApi, ago, countryName, failed, flag, td, th, usePageSize, useAdmin } from '../ui';

type Visit = {
  id: number; at: string; ip: string; country: string | null; path: string; referrer: string | null; device: string;
  user_id: number | null; user_name: string | null; user_role: string | null;
};
type Data = {
  totals: Record<'views_24h' | 'visitors_24h' | 'views_7d' | 'visitors_7d' | 'views_30d' | 'visitors_30d', number>;
  countries: { country: string; visitors: number }[];
  pages: { path: string; views: number; visitors: number }[];
  visits: Visit[]; total: number; keep_days: number;
};
const n = (v: number) => v.toLocaleString('en-US');
const site = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

// Everyone who opened the site (signed in or not): totals, where they're from, the most-viewed pages, and
// each visit with its IP. A visitor is one IP address; visits older than the keep period are deleted.
export default function Visitors() {
  const { logout } = useAdmin();
  const [page, setPage] = useState(0);
  const [size, setSize] = usePageSize();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    adminApi<Data>(`/visitors?page=${page}&per_page=${size}`).then(setData, failed(logout, setError));
  }, [page, size, logout]);
  const t = data?.totals;
  const tiles: [string, number | undefined, number | undefined][] = [['Last 24 hours', t?.visitors_24h, t?.views_24h], ['Last 7 days', t?.visitors_7d, t?.views_7d], ['Last 30 days', t?.visitors_30d, t?.views_30d]];

  return (
    <>
      <PageHeader title="Visitors" sub={data ? `Everyone who opened the site. Visits are kept ${data.keep_days} days.` : ' '} />
      <ErrorText msg={error} />
      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map(([label, people, views]) => (
          <section key={label} className={`${card} p-4`}>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-2xl font-bold tabular-nums text-slate-900">{people === undefined ? '…' : n(people)} <span className="text-sm font-medium text-slate-500">visitors</span></p>
            <p className="text-xs text-slate-500 tabular-nums">{views === undefined ? '' : `${n(views)} page views`}</p>
          </section>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${card} p-4`}>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Countries <span className="font-normal text-slate-500">· last 30 days</span></h2>
          {data?.countries.length ? (
            <ul className="space-y-1.5 text-sm">
              {data.countries.map((c) => (
                <li key={c.country} className="flex items-center gap-2">
                  <span className="w-40 truncate">{flag(c.country)} {c.country === '??' ? 'Unknown' : countryName(c.country)}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-emerald-600" style={{ width: `${(c.visitors / data.countries[0].visitors) * 100}%` }} /></span>
                  <span className="w-10 text-right tabular-nums text-slate-600">{n(c.visitors)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-500">{data ? 'No visits yet.' : 'Loading…'}</p>}
        </section>
        <section className={`${card} p-4`}>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Top pages <span className="font-normal text-slate-500">· last 7 days</span></h2>
          {data?.pages.length ? (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {data.pages.map((p) => (
                  <tr key={p.path}><td className="max-w-0 truncate py-1.5 pr-2 font-mono text-xs text-slate-700">{p.path}</td><td className="py-1.5 text-right tabular-nums">{n(p.views)}</td><td className="w-20 py-1.5 text-right text-xs tabular-nums text-slate-500">{n(p.visitors)} people</td></tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-sm text-slate-500">{data ? 'No visits yet.' : 'Loading…'}</p>}
        </section>
      </div>

      <section className={`${card} overflow-x-auto p-0`}>
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">Recent visits</h2>
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-slate-200">
            <tr><th className={th}>When</th><th className={th}>IP address</th><th className={th}>Country</th><th className={th}>Page</th><th className={th}>Who</th><th className={th}>Device</th><th className={th}>Came from</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!data && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>}
            {data?.visits.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No visits yet.</td></tr>}
            {data?.visits.map((v) => (
              <tr key={v.id} className="hover:bg-slate-50">
                <td className={`${td} whitespace-nowrap text-slate-600`} title={new Date(v.at).toLocaleString()}>{ago(v.at)}</td>
                <td className={`${td} select-all font-mono text-xs`}>{v.ip}</td>
                <td className={`${td} whitespace-nowrap text-slate-600`}>{v.country ? `${flag(v.country)} ${v.country}` : '-'}</td>
                <td className={`${td} max-w-56 truncate font-mono text-xs text-slate-700`}>{v.path}</td>
                <td className={td}>{v.user_name ? <span>{v.user_name} <span className="text-xs text-slate-500">· {v.user_role}</span></span> : <span className="text-slate-400">Visitor</span>}</td>
                <td className={`${td} whitespace-nowrap text-slate-600`}>{v.device}</td>
                <td className={`${td} text-slate-600`}>{v.referrer ? site(v.referrer) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {data && <Pager page={page} total={data.total} size={size} onPage={setPage} onSize={(s) => { setSize(s); setPage(0); }} noun="visits" />}
    </>
  );
}
