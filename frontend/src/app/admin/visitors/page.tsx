'use client';
import { useEffect, useState } from 'react';
import { ErrorText, button, card } from '@/components/ui';
import { PageHeader, Pager, Seg, adminApi, ago, countryName, failed, flag, td, th, usePageSize, useAdmin } from '../ui';

type Visit = {
  id: number; at: string; ip: string; country: string | null; path: string; referrer: string | null; device: string;
  user_id: number | null; user_name: string | null; user_role: string | null;
};
type Data = {
  totals: Record<`${'views' | 'visitors'}_${'24h' | '7d' | '30d' | '6m'}`, number>;
  range: Range;
  countries: { country: string; visitors: number }[];
  pages: { path: string; views: number; visitors: number }[];
  visits: Visit[]; total: number; keep_days: number;
  my_ip: string; my_ip_ignored: boolean; ignored: { net: string; label: string | null; added_at: string }[];
};
const n = (v: number) => v.toLocaleString('en-US');
type Range = '7d' | '30d' | '6m';
const RANGES: [Range, string][] = [['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['6m', 'Last 6 months']];
const site = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

// Everyone who opened the site (signed in or not): totals, where they're from, the pages visits start on, and
// each visit with its IP. One row per visit (its first page); a visitor is one IP address; visits older than the
// keep period are deleted. IPs in "Not counted" (the admin's own) are left out everywhere.
export default function Visitors() {
  const { logout } = useAdmin();
  const [page, setPage] = useState(0);
  const [size, setSize] = usePageSize();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [range, setRange] = useState<Range>('30d');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    adminApi<Data>(`/visitors?range=${range}&page=${page}&per_page=${size}`).then(setData, failed(logout, setError));
  }, [range, page, size, logout, reload]);
  const period = RANGES.find(([k]) => k === range)![1].toLowerCase();
  const t = data?.totals;
  const tiles: [string, number | undefined, number | undefined][] = [['Last 24 hours', t?.visitors_24h, t?.views_24h], ['Last 7 days', t?.visitors_7d, t?.views_7d], ['Last 30 days', t?.visitors_30d, t?.views_30d], ['Last 6 months', t?.visitors_6m, t?.views_6m]];

  return (
    <>
      <PageHeader title="Visitors" sub={data ? 'Everyone who opened the site, one row per visit. Kept about 6 months.' : ' '} />
      <ErrorText msg={error} />

      <MyIps data={data} onChange={() => { setPage(0); setReload((r) => r + 1); }} onError={failed(logout, setError)} />
      <div className="flex justify-end"><Seg label="Period" value={range} onChange={(r) => { setRange(r); setPage(0); }} options={RANGES} /></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, people, views]) => (
          <section key={label} className={`${card} p-4`}>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-2xl font-bold tabular-nums text-slate-900">{people === undefined ? '…' : n(people)} <span className="text-sm font-medium text-slate-500">visitors</span></p>
            <p className="text-xs text-slate-500 tabular-nums">{views === undefined ? '' : `${n(views)} visits`}</p>
          </section>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${card} p-4`}>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Countries <span className="font-normal text-slate-500">· {period}</span></h2>
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
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Where visits start <span className="font-normal text-slate-500">· {period}</span></h2>
          {data?.pages.length ? (
            <table className="w-full table-fixed text-sm">
              <tbody className="divide-y divide-slate-100">
                {data.pages.map((p) => (
                  <tr key={p.path}><td className="truncate py-1.5 pr-2 font-mono text-xs text-slate-700" title={p.path}>{p.path}</td><td className="w-20 whitespace-nowrap py-1.5 text-right tabular-nums">{n(p.views)} visits</td><td className="w-20 whitespace-nowrap py-1.5 text-right text-xs tabular-nums text-slate-500">{n(p.visitors)} {p.visitors === 1 ? 'person' : 'people'}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-sm text-slate-500">{data ? 'No visits yet.' : 'Loading…'}</p>}
        </section>
      </div>

      <section className={`${card} overflow-x-auto p-0`}>
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">Visits <span className="font-normal text-slate-500">· {period}</span></h2>
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-slate-200">
            <tr><th className={th}>When</th><th className={th}>IP address</th><th className={th}>Country</th><th className={th}>Landed on</th><th className={th}>Who</th><th className={th}>Device</th><th className={th}>Came from</th></tr>
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

// "My IPs": addresses left out of every number here (yours: home, office, phone). Add the one you're on with
// one click, or type any other; Remove counts it again. Past visits from them are hidden too.
function MyIps({ data, onChange, onError }: { data: Data | null; onChange: () => void; onError: (e: Error) => void }) {
  const [form, setForm] = useState({ ip: '', label: '' });
  const [busy, setBusy] = useState(false);
  async function send(method: 'POST' | 'DELETE', body: object) {
    setBusy(true);
    try { await adminApi('/ignored-ips', method, body); setForm({ ip: '', label: '' }); onChange(); }
    catch (err) { onError(err as Error); }
    finally { setBusy(false); }
  }
  const field = 'h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-emerald-600 focus:outline-none';
  return (
    <section className={`${card} space-y-3 p-4`}>
      <div>
        <h2 className="text-sm font-semibold text-slate-900">My IPs <span className="font-normal text-slate-500">· not counted as visitors</span></h2>
        <p className="text-xs text-slate-500">
          You’re on <span className="select-all font-mono text-slate-700">{data?.my_ip ?? '…'}</span>{' '}
          {data && (data.my_ip_ignored
            ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">not counted</span>
            : <button type="button" disabled={busy} onClick={() => send('POST', { label: form.label.trim() || undefined })} className="font-semibold text-emerald-700 hover:underline">Add this one</button>)}
        </p>
      </div>
      {!!data?.ignored.length && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
          {data.ignored.map((x) => (
            <li key={x.net} className="flex items-center gap-3 px-3 py-2">
              <span className="w-36 truncate font-medium text-slate-900">{x.label ?? 'No name'}</span>
              <span className="flex-1 truncate font-mono text-xs text-slate-600">{x.net.replace(/\/(32|128)$/, '')}</span>
              <span className="hidden text-xs text-slate-500 sm:inline">added {ago(x.added_at)}</span>
              <button type="button" onClick={() => send('DELETE', { net: x.net })} disabled={busy} aria-label={`Count ${x.label ?? x.net} again`}
                className="rounded-md px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">Remove</button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => { e.preventDefault(); if (form.ip.trim()) send('POST', { ip: form.ip.trim(), label: form.label.trim() || undefined }); }} className="flex flex-wrap items-center gap-2">
        <input value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} placeholder="IP address, e.g. 203.177.12.34" aria-label="IP address" className={`${field} w-56 font-mono`} />
        <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Name, e.g. Office" maxLength={60} aria-label="Name for this IP" className={`${field} w-40`} />
        <button className={`${button} h-9 px-4 py-0`} disabled={busy || !form.ip.trim()}>Add IP</button>
      </form>
      <p className="text-xs text-slate-500">Phones and home internet sometimes get a new IP: if your visits show up again, add the new one. IPv6 addresses cover their whole home network.</p>
    </section>
  );
}
