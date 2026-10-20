'use client';
import { useEffect, useState } from 'react';
import { ErrorText, FormAlert, card } from '@/components/ui';
import { useApi } from '@/lib/api';
import { PLAN_PILL, PageHeader, Pager, adminApi, date, failed, money, pageOf, pill, td, th, usePageSize, useAdmin } from '../ui';

type Sub = {
  id: number; name: string; email: string; plan: 'pro' | 'premium'; since: string | null; source: 'paddle' | 'manual' | 'unknown';
  status: string | null; price: number | null; yearly: boolean; monthly: number | null; next_billed_at: string | null; cancels_at: string | null;
};
type Data = {
  totals: { monthly_revenue: number; paying: number; pro: number; premium: number; cancelling: number; past_due: number; manual: number; employers: number };
  subscriptions: Sub[]; paddle_error: string | null;
};

// Who pays and how much. Prices, renewals and payment status come live from Paddle; plans switched on by
// hand show as "Manual".
export default function Subscriptions() {
  const { logout } = useAdmin();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = usePageSize();
  useEffect(() => { adminApi<Data>('/subscriptions').then(setData, failed(logout, setError)); }, [logout]);
  const { data: billing } = useApi<{ environment: string }>('/billing/config');
  const paddleEnv = billing?.environment;

  if (error && !data) return <div className={card}><ErrorText msg={error} /></div>;
  if (!data) return <p className="text-slate-500">Loading subscriptions from Paddle…</p>;
  const t = data.totals;
  const conversion = t.employers ? Math.round((t.paying / t.employers) * 1000) / 10 : 0;
  const status = (s: Sub) =>
    s.source === 'manual' ? ['Manual', 'bg-slate-100 text-slate-600']
    : s.status === 'past_due' ? ['Payment failed', 'bg-red-50 text-red-700']
    : s.cancels_at ? ['Cancelling', 'bg-amber-50 text-amber-800']
    : s.status === 'active' ? ['Active', 'bg-emerald-50 text-emerald-800']
    : s.status === 'paused' ? ['Paused', 'bg-slate-100 text-slate-600']
    : ['Not found in Paddle', 'bg-red-50 text-red-700'];

  const tiles: [string, string, string][] = [
    ['Monthly revenue', money(t.monthly_revenue), 'yearly plans counted per month · before Paddle’s fee'],
    ['Paying employers', String(t.paying), `${t.pro} Pro · ${t.premium} Premium${t.manual ? ` · ${t.manual} manual` : ''}`],
    ['Free → paid', `${conversion}%`, `of ${t.employers} employers`],
    ['Needs a look', String(t.cancelling + t.past_due), `${t.cancelling} cancelling · ${t.past_due} payment failed`],
  ];
  return (
    <>
      <PageHeader title="Subscriptions" sub="Live from Paddle">
        <a href={`https://${paddleEnv === 'production' ? '' : 'sandbox-'}vendors.paddle.com/subscriptions-v2`} target="_blank" rel="noopener noreferrer"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-emerald-600">Open Paddle ↗</a>
      </PageHeader>
      {data.paddle_error && <FormAlert tone="error" title="Paddle didn’t answer">{data.paddle_error}</FormAlert>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(([label, value, hint]) => (
          <div key={label} className={`${card} p-5`}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 font-display text-3xl font-bold tabular-nums text-slate-900">{value}</p>
            <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
          </div>
        ))}
      </div>
      <section className={`${card} overflow-x-auto p-0`}>
        <div className="px-4 pt-4"><h2 className="font-semibold">Paying employers</h2><p className="text-xs text-slate-500">Newest first</p></div>
        <table className="mt-2 w-full min-w-[820px] text-sm">
          <thead className="border-b border-slate-200">
            <tr><th className={th}>Employer</th><th className={th}>Plan</th><th className={th}>Billing</th><th className={th}>Price</th><th className={th}>Renews / ends</th><th className={th}>Status</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.subscriptions.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No paying employers yet.</td></tr>}
            {pageOf(data.subscriptions, page, size).map((s) => {
              const [label, tone] = status(s);
              return (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className={td}><span className="block font-medium text-slate-900">{s.name}</span><span className="block select-all text-xs text-slate-500">{s.email}</span></td>
                  <td className={td}><span className={`${pill} ${PLAN_PILL[s.plan]}`}>{s.plan}</span></td>
                  <td className={`${td} text-slate-600`}>{s.source === 'manual' ? 'Set by hand' : s.price === null ? '-' : s.yearly ? 'Yearly' : 'Monthly'}</td>
                  <td className={`${td} tabular-nums text-slate-700`}>{s.price === null ? '-' : `${money(s.price)} / ${s.yearly ? 'yr' : 'mo'}`}</td>
                  <td className={`${td} text-slate-600`}>{s.cancels_at ? <span className="text-amber-800">Ends {date(s.cancels_at)}</span> : date(s.next_billed_at)}</td>
                  <td className={td}><span className={`${pill} ${tone}`}>{label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      {data.subscriptions.length > 0 && <Pager page={page} total={data.subscriptions.length} size={size} onPage={setPage} onSize={setSize} noun="paying employers" />}
    </>
  );
}
