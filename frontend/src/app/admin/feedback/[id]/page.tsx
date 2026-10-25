'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ErrorText, button, card } from '@/components/ui';
import { adminApi, ago, failed, pill, useAdmin } from '../../ui';

type Ticket = {
  id: number; type: string; subject: string | null; message: string; page: string | null; contact_ok: boolean; created_at: string;
  done_at: string | null; email: string | null; name: string | null; role: string | null; user_id: number | null;
  messages: { id: number; from_admin: boolean; body: string; created_at: string }[];
};
const TYPE: Record<string, string> = { idea: 'Idea', bug: 'Something broke', other: 'Other feedback', support: 'Support request', email: 'Email to support@' };

// One conversation: what they wrote, our replies (sent by email from here) and their email answers, in order.
// "Send and resolve" closes it in one go; their next email reopens it.
export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const { logout, refreshCounts } = useAdmin();
  const [t, setT] = useState<Ticket | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(() => adminApi<Ticket>(`/feedback/${id}`).then(setT, failed(logout, setError)), [id, logout]);
  useEffect(() => { load(); }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await fn(); await load(); refreshCounts(); } catch (err) { failed(logout, setError)(err as Error); } finally { setBusy(false); }
  }
  const reply = (resolve: boolean) => act(async () => { await adminApi(`/feedback/${id}/reply`, 'POST', { body: draft, resolve }); setDraft(''); });
  const setDone = (done: boolean) => act(() => adminApi(`/feedback/${id}`, 'PUT', { done }));

  if (!t) return error ? <ErrorText msg={error} /> : <p className="text-sm text-slate-500">Loading…</p>;
  const first = t.name?.split(' ')[0] ?? 'them';
  const thread = [{ id: 0, from_admin: false, body: t.message, created_at: t.created_at }, ...t.messages];
  return (
    <>
      <Link href="/admin/feedback" className="text-sm font-medium text-slate-500 hover:text-slate-900">‹ Feedback & support</Link>
      <section className={`${card} flex flex-wrap items-start justify-between gap-3`}>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`${pill} normal-case bg-slate-100 text-slate-700`}>{TYPE[t.type] ?? t.type}</span>
            <span className={`${pill} ${t.done_at ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-900'}`}>{t.done_at ? 'Resolved' : 'Open'}</span>
          </div>
          <h1 className="text-lg font-bold text-slate-900">#{t.id} {t.subject ?? 'Feedback'}</h1>
          <p className="text-sm text-slate-600">
            {t.user_id ? <Link href={`/admin/users/${t.user_id}`} className="font-medium text-emerald-800 hover:underline">{t.name}</Link> : (t.name ?? 'Visitor')}
            {t.role && ` (${t.role})`}{t.email && <> · <span className="select-all">{t.email}</span></>}{t.page && ` · from ${t.page}`}
          </p>
        </div>
        <button type="button" disabled={busy} onClick={() => setDone(!t.done_at)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          {t.done_at ? 'Reopen' : 'Resolve'}
        </button>
      </section>

      <section className={`${card} space-y-3`}>
        {thread.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.from_admin ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.from_admin ? 'rounded-br-md bg-emerald-950 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'}`}>{m.body}</div>
            <span className="mt-1 px-1 text-[11px] text-slate-400" title={new Date(m.created_at).toLocaleString()}>{m.from_admin ? 'You' : first} · {ago(m.created_at)}</span>
          </div>
        ))}
      </section>

      <section className={`${card} space-y-2`}>
        {t.email ? <>
          {!t.contact_ok && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">They didn’t tick “OK to contact me”. Reply only if it really helps them.</p>}
          <label className="block text-sm font-semibold text-slate-900" htmlFor="reply">Reply to {first} <span className="font-normal text-slate-500">· emailed to {t.email}</span></label>
          <textarea id="reply" value={draft} onChange={(e) => setDraft(e.target.value)} rows={6} maxLength={5000} placeholder={`Hi ${first}, …`}
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20" />
          <ErrorText msg={error} />
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" disabled={busy || draft.trim().length < 2} onClick={() => reply(false)} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Send</button>
            <button type="button" disabled={busy || draft.trim().length < 2} onClick={() => reply(true)} className={button}>{busy ? 'Sending…' : 'Send and resolve'}</button>
          </div>
          <p className="text-xs text-slate-500">They get it from ReadyToWork.ph; when they reply, it shows up here and the conversation opens again.</p>
        </> : <p className="text-sm text-slate-500">They didn’t leave an email address, so there’s no way to reply.</p>}
      </section>
    </>
  );
}
