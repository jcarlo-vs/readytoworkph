'use client';
import { useCallback, useEffect, useState } from 'react';
import { ErrorText, button, card } from '@/components/ui';
import { PageHeader, Seg, adminApi, ago, failed, useAdmin } from '../ui';

type Notice = { text: string; tone: 'info' | 'warning'; ends_at?: string | null } | null;
type Audience = 'employers' | 'workers' | 'everyone';
type Broadcasts = {
  counts: Record<Audience, number>; test_to: string | null;
  history: { id: number; audience: Audience; subject: string; recipients: number; sent: number; failed: number; created_at: string; finished_at: string | null }[];
};
const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20';
// <input type="datetime-local"> works in local time without a zone; the server stores a real moment.
const toLocal = (iso?: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '');

// Talking to everyone: the notice bar at the top of every page, and emails to all employers, all workers, or both.
export default function Announcements() {
  return (
    <>
      <PageHeader title="Announcements" sub="A notice on every page of the site, or an email to everyone." />
      <NoticeForm />
      <EmailEveryone />
    </>
  );
}

function NoticeForm() {
  const { logout } = useAdmin();
  const [saved, setSaved] = useState<Notice | undefined>(undefined);
  const [form, setForm] = useState({ text: '', tone: 'info' as 'info' | 'warning', ends: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    adminApi<{ notice: Notice }>('/settings').then(({ notice }) => {
      setSaved(notice);
      if (notice) setForm({ text: notice.text, tone: notice.tone, ends: toLocal(notice.ends_at) });
    }, failed(logout, setError));
  }, [logout]);
  async function save(notice: Notice) {
    setBusy(true); setError('');
    try { await adminApi('/settings', 'PUT', { notice }); setSaved(notice); if (!notice) setForm({ text: '', tone: 'info', ends: '' }); }
    catch (err) { failed(logout, setError)(err as Error); } finally { setBusy(false); }
  }
  const warn = form.tone === 'warning';
  return (
    <section className={`${card} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Notice bar</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${saved ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{saved === undefined ? '…' : saved ? `On${saved.ends_at ? ` until ${new Date(saved.ends_at).toLocaleString()}` : ''}` : 'Off'}</span>
      </div>
      <p className="text-xs text-slate-500">One line at the top of every page (not the admin panel). Visitors can close it; a new notice shows again.</p>
      {form.text.trim() && (
        <div className={`rounded-lg px-4 py-2 text-center text-sm font-medium ${warn ? 'bg-amber-400 text-slate-950' : 'bg-emerald-950 text-emerald-50'}`} aria-label="Preview">{form.text.trim()}</div>
      )}
      <input value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} maxLength={200} placeholder="e.g. Maintenance tonight 10pm to 11pm (Manila time). The site may be slow." aria-label="Notice text" className={field} />
      <div className="flex flex-wrap items-end gap-3">
        <Seg label="Colour" value={form.tone} onChange={(tone) => setForm({ ...form, tone })} options={[['info', 'Green: news'], ['warning', 'Yellow: warning']]} />
        <label className="text-xs text-slate-600">Hide it after (optional)
          <input type="datetime-local" value={form.ends} onChange={(e) => setForm({ ...form, ends: e.target.value })} className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
        <span className="flex-1" />
        {saved && <button type="button" disabled={busy} onClick={() => save(null)} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Turn off</button>}
        <button type="button" disabled={busy || form.text.trim().length < 3} className={button}
          onClick={() => save({ text: form.text.trim(), tone: form.tone, ends_at: form.ends ? new Date(form.ends).toISOString() : null })}>
          {saved ? 'Update notice' : 'Show notice'}
        </button>
      </div>
      <ErrorText msg={error} />
    </section>
  );
}

function EmailEveryone() {
  const { logout } = useAdmin();
  const [data, setData] = useState<Broadcasts | null>(null);
  const [form, setForm] = useState({ audience: 'everyone' as Audience, subject: '', body: '' });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const load = useCallback(() => adminApi<Broadcasts>('/broadcasts').then(setData, failed(logout, setError)), [logout]);
  useEffect(() => { load(); }, [load]);
  const count = data?.counts[form.audience] ?? 0;
  const ready = form.subject.trim() && form.body.trim().length >= 10;

  async function send(test: boolean) {
    setBusy(true); setError(''); setDone('');
    try {
      const r = await adminApi<{ to?: string; sent?: number; failed?: number }>('/broadcasts', 'POST', { ...form, test, confirm: count });
      if (test) setDone(`Test sent to ${r.to}. Check how it looks before sending to everyone.`);
      else { setDone(`Sent to ${r.sent} people${r.failed ? `; ${r.failed} failed (see the server log)` : ''}.`); setForm({ ...form, subject: '', body: '' }); setConfirming(false); }
      load();
    } catch (err) { failed(logout, setError)(err as Error); setConfirming(false); load(); } finally { setBusy(false); }
  }
  const who = { employers: 'employers', workers: 'workers', everyone: 'employers and workers' }[form.audience];
  return (
    <section className={`${card} space-y-3`}>
      <h2 className="text-sm font-semibold text-slate-900">Email everyone</h2>
      <p className="text-xs text-slate-500">Goes only to confirmed, active accounts that haven’t unsubscribed. Every email has an unsubscribe link. Send yourself a test first.</p>
      <Seg label="Who gets it" value={form.audience} onChange={(audience) => { setForm({ ...form, audience }); setConfirming(false); }}
        options={(['everyone', 'employers', 'workers'] as const).map((a) => [a, `${a[0].toUpperCase() + a.slice(1)} · ${data?.counts[a] ?? '…'}`])} />
      <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} maxLength={150} placeholder="Subject" aria-label="Subject" className={field} />
      <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={8} maxLength={5000} aria-label="Message"
        placeholder={'Write the message. It starts with “Hi [first name],” on its own.\n\nLeave an empty line between paragraphs.'} className={field} />
      <ErrorText msg={error} />
      {done && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">{done}</p>}
      {confirming ? (
        <div className="flex flex-wrap items-center justify-end gap-2 rounded-lg bg-amber-50 p-3">
          <p className="flex-1 text-sm text-amber-950">Send “{form.subject.trim()}” to <b>{count}</b> {who}? This can’t be undone.</p>
          <button type="button" onClick={() => setConfirming(false)} className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white">Cancel</button>
          <button type="button" disabled={busy} onClick={() => send(false)} className={button}>{busy ? 'Sending…' : `Yes, send to ${count}`}</button>
        </div>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={busy || !ready || !data?.test_to} onClick={() => send(true)} title={data?.test_to ? undefined : 'ADMIN_EMAIL isn’t set on the server'}
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Send me a test{data?.test_to ? ` (${data.test_to})` : ''}</button>
          <button type="button" disabled={busy || !ready || !count} onClick={() => setConfirming(true)} className={button}>Send to {count} {who}</button>
        </div>
      )}
      {!!data?.history.length && (
        <div className="border-t border-slate-100 pt-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Sent before</h3>
          <ul className="divide-y divide-slate-100 text-sm">
            {data.history.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-medium text-slate-900">{b.subject} <span className="font-normal text-slate-500">· {b.audience}</span></span>
                <span className="text-xs text-slate-500">{b.sent} of {b.recipients} sent{b.failed ? `, ${b.failed} failed` : ''}{!b.finished_at && ' (stopped early)'} · {ago(b.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
