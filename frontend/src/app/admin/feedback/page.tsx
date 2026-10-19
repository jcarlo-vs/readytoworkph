'use client';
import { useCallback, useEffect, useState } from 'react';
import { ErrorText, card } from '@/components/ui';
import { PageHeader, Search, Seg, adminApi, ago, failed, pill, useAdmin } from '../ui';

type Feedback = {
  id: number; type: 'idea' | 'bug' | 'other' | 'support'; subject: string | null; message: string; page: string | null; contact_ok: boolean;
  created_at: string; done_at: string | null; email: string | null; name: string | null; role: string | null;
};
const LABEL = {
  idea: { text: 'Idea', className: 'bg-emerald-50 text-emerald-800' },
  bug: { text: 'Something broke', className: 'bg-red-50 text-red-700' },
  other: { text: 'Other', className: 'bg-slate-100 text-slate-700' },
  support: { text: 'Support request', className: 'bg-sky-50 text-sky-800' },
};

// What people tell us to improve. Open items first; mark one done once it's handled (or reopen it).
export default function FeedbackPage() {
  const { logout, refreshCounts } = useAdmin();
  const [items, setItems] = useState<Feedback[] | null>(null);
  const [filter, setFilter] = useState<'open' | 'all' | Feedback['type']>('open');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => adminApi<Feedback[]>('/feedback').then(setItems, failed(logout, setError)), [logout]);
  useEffect(() => { load(); }, [load]);

  async function mark(f: Feedback, done: boolean) {
    setItems((list) => list && list.map((x) => (x.id === f.id ? { ...x, done_at: done ? new Date().toISOString() : null } : x)));
    try { await adminApi(`/feedback/${f.id}`, 'PUT', { done }); refreshCounts(); } catch (err) { failed(logout, setError)(err as Error); load(); }
  }

  const open = items?.filter((f) => !f.done_at).length ?? 0;
  const term = q.trim().toLowerCase();
  const shown = (items ?? [])
    .filter((f) => (filter === 'open' ? !f.done_at : filter === 'all' ? true : f.type === filter))
    .filter((f) => !term || `${f.subject ?? ''} ${f.message} ${f.name ?? ''} ${f.email ?? ''} ${f.page ?? ''}`.toLowerCase().includes(term));
  return (
    <>
      <PageHeader title="Feedback & support" sub={`${open} open · each one is also emailed to support@readytowork.ph`}>
        <Search value={q} onChange={setQ} placeholder="Search feedback" />
      </PageHeader>
      <Seg label="Show" value={filter} onChange={setFilter} options={[['open', 'Open'], ['all', 'All'], ['support', 'Support'], ['idea', 'Ideas'], ['bug', 'Broken'], ['other', 'Other']]} />
      <ErrorText msg={error} />
      <section className={card}>
        {!items ? <p className="text-sm text-slate-500">Loading…</p> : shown.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{filter === 'open' && !term ? 'Nothing open. Nice!' : 'No feedback matches.'}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map((f) => (
              <li key={f.id} className={`flex flex-wrap items-start gap-4 py-4 first:pt-0 last:pb-0 ${f.done_at ? 'opacity-60' : ''}`}>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className={`${pill} normal-case ${LABEL[f.type].className}`}>{LABEL[f.type].text}</span>
                    <span className="font-medium text-slate-700">{f.name ? `${f.name} (${f.role})` : 'Visitor'}</span>
                    {f.email && <span className="select-all">{f.email}</span>}
                    {f.contact_ok && f.email && <span className="font-semibold text-emerald-700">OK to reply</span>}
                    <span>· {ago(f.created_at)}</span>
                    {f.page && <span>· {f.page}</span>}
                  </div>
                  {f.subject && <p className="text-sm font-semibold text-slate-900">{f.subject}</p>}
                  <p className="whitespace-pre-line text-sm text-slate-800">{f.message}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {f.contact_ok && f.email && (
                    <a href={`mailto:${f.email}?subject=${encodeURIComponent(f.subject ? `Re: ${f.subject}` : 'About your feedback on ReadyToWork.ph')}`}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Reply</a>
                  )}
                  <button type="button" onClick={() => mark(f, !f.done_at)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    {f.done_at ? 'Reopen' : 'Mark done'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
