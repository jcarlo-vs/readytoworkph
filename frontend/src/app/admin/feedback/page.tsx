'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ErrorText, card } from '@/components/ui';
import { PageHeader, Pager, Search, Seg, adminApi, ago, failed, pageOf, pill, usePageSize, useAdmin } from '../ui';

type Feedback = {
  id: number; type: 'idea' | 'bug' | 'other' | 'support' | 'email'; subject: string | null; message: string; page: string | null; contact_ok: boolean;
  created_at: string; done_at: string | null; email: string | null; name: string | null; role: string | null;
  replies: number; they_replied_last: boolean | null;
};
const LABEL = {
  idea: { text: 'Idea', className: 'bg-emerald-50 text-emerald-800' },
  bug: { text: 'Something broke', className: 'bg-red-50 text-red-700' },
  other: { text: 'Other', className: 'bg-slate-100 text-slate-700' },
  support: { text: 'Support request', className: 'bg-sky-50 text-sky-800' },
  email: { text: 'Email', className: 'bg-indigo-50 text-indigo-800' },
};

// Support requests, emails to support@ and feedback. Open first; open one to read the conversation and reply by
// email. Resolve it when it's handled; their next email reopens it.
export default function FeedbackPage() {
  const { logout, refreshCounts } = useAdmin();
  const [items, setItems] = useState<Feedback[] | null>(null);
  const [filter, setFilter] = useState<'open' | 'all' | Feedback['type']>('open');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = usePageSize();
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
      <PageHeader title="Feedback & support" sub={`${open} open · reply from here and their answers come back here`}>
        <Search value={q} onChange={(v) => { setQ(v); setPage(0); }} placeholder="Search feedback" />
      </PageHeader>
      <Seg label="Show" value={filter} onChange={(v) => { setFilter(v); setPage(0); }} options={[['open', 'Open'], ['all', 'All'], ['support', 'Support'], ['email', 'Emails'], ['idea', 'Ideas'], ['bug', 'Broken'], ['other', 'Other']]} />
      <ErrorText msg={error} />
      <section className={card}>
        {!items ? <p className="text-sm text-slate-500">Loading…</p> : shown.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{filter === 'open' && !term ? 'Nothing open. Nice!' : 'No feedback matches.'}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pageOf(shown, page, size).map((f) => (
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
                  <Link href={`/admin/feedback/${f.id}`} className="block hover:underline">
                    {f.subject && <span className="block text-sm font-semibold text-slate-900">#{f.id} {f.subject}</span>}
                    <span className="line-clamp-2 whitespace-pre-line text-sm text-slate-800">{f.message}</span>
                  </Link>
                  {f.replies > 0 && (
                    <p className={`text-xs font-semibold ${f.they_replied_last ? 'text-amber-700' : 'text-slate-500'}`}>
                      {f.they_replied_last ? 'They replied: waiting for you' : 'You replied'} · {f.replies} {f.replies === 1 ? 'reply' : 'replies'}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Link href={`/admin/feedback/${f.id}`} className="rounded-lg bg-emerald-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900">Open</Link>
                  <button type="button" onClick={() => mark(f, !f.done_at)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    {f.done_at ? 'Reopen' : 'Resolve'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {items && shown.length > 0 && <Pager page={page} total={shown.length} size={size} onPage={setPage} onSize={setSize} noun="items" />}
    </>
  );
}
