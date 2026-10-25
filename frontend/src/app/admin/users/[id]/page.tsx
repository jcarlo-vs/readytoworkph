'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ErrorText, card } from '@/components/ui';
import { PLAN_PILL, adminApi, ago, countryName, date, failed, flag, pill, useAdmin } from '../../ui';
import { SuspendDialog } from '../../SuspendDialog';

type Detail = {
  user: {
    id: number; email: string; name: string; role: 'worker' | 'employer'; plan: string; plan_changed_at: string | null; created_at: string;
    last_seen_at: string | null; last_country: string | null; google: boolean; has_password: boolean; email_verified_at: string | null;
    suspended_at: string | null; deactivated_at: string | null; deleted_at: string | null; announcements_off_at: string | null; paddle: boolean;
  };
  jobs: { id: number; title: string; created_at: string; closed_at: string | null; applicants: number }[];
  applications: { id: number; created_at: string; credits: number; job_id: number; job_title: string; employer: string }[];
  messages: { sent: number; received: number };
  tickets: { id: number; type: string; subject: string; created_at: string; done_at: string | null }[];
  actions: { at: string; action: string; detail: string | null }[];
};
const action = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';

// One person, everything about them in one place, and the fixes support needs: confirm their email, send a new
// code, change a plan by hand, suspend, or delete the account when they ask. Every fix is logged in History.
export default function UserPage() {
  const { id } = useParams<{ id: string }>();
  const { logout } = useAdmin();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const load = useCallback(() => adminApi<Detail>(`/users/${id}`).then(setD, failed(logout, setError)), [id, logout]);
  useEffect(() => { load(); }, [load]);

  async function run(path: string, method: string, body: object | undefined, done: string) {
    setBusy(true); setError(''); setNotice('');
    try { await adminApi(`/users/${id}${path}`, method, body); setNotice(done); await load(); }
    catch (err) { failed(logout, setError)(err as Error); }
    finally { setBusy(false); }
  }

  if (!d) return error ? <ErrorText msg={error} /> : <p className="text-sm text-slate-500">Loading…</p>;
  const u = d.user;
  const gone = !!u.deleted_at;
  const status = gone ? ['Deleted', 'bg-slate-200 text-slate-700'] : u.suspended_at ? ['Suspended', 'bg-red-100 text-red-800']
    : u.deactivated_at ? ['Paused', 'bg-slate-100 text-slate-700'] : !u.email_verified_at ? ['Email not confirmed', 'bg-amber-100 text-amber-900'] : ['Active', 'bg-emerald-100 text-emerald-800'];

  return (
    <>
      <Link href="/admin/users" className="text-sm font-medium text-slate-500 hover:text-slate-900">‹ Users</Link>
      <section className={`${card} flex flex-wrap items-start justify-between gap-4`}>
        <div className="space-y-1.5">
          <h1 className="text-xl font-bold text-slate-900">{u.name}</h1>
          <p className="select-all text-sm text-slate-600">{u.email}</p>
          <div className="flex flex-wrap gap-1.5">
            <span className={`${pill} ${status[1]}`}>{status[0]}</span>
            <span className={`${pill} ${u.role === 'employer' ? 'bg-sky-50 text-sky-800' : 'bg-violet-50 text-violet-800'}`}>{u.role}</span>
            {u.role === 'employer' && <span className={`${pill} ${PLAN_PILL[u.plan]}`}>{u.plan}{u.paddle ? ' · Paddle' : ''}</span>}
            {u.google && <span className={`${pill} bg-slate-100 text-slate-700`}>Google</span>}
            {u.announcements_off_at && <span className={`${pill} bg-slate-100 text-slate-700`}>No announcements</span>}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <dt className="text-slate-500">Joined</dt><dd>{date(u.created_at)}</dd>
          <dt className="text-slate-500">Last active</dt><dd>{u.last_seen_at ? ago(u.last_seen_at) : 'never'}</dd>
          <dt className="text-slate-500">Country</dt><dd>{u.last_country ? `${flag(u.last_country)} ${countryName(u.last_country)}` : '-'}</dd>
          <dt className="text-slate-500">Messages</dt><dd>{d.messages.sent} sent · {d.messages.received} received</dd>
        </dl>
      </section>

      {notice && <p className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-900" role="status">{notice}</p>}
      <ErrorText msg={error} />

      {!gone && (
        <section className={`${card} space-y-3`}>
          <h2 className="text-sm font-semibold text-slate-900">Fix things</h2>
          <div className="flex flex-wrap items-center gap-2">
            {!u.email_verified_at && <>
              <button type="button" disabled={busy} className={action} onClick={() => run('/confirm-email', 'POST', undefined, 'Email confirmed. They can use the site now.')}>Confirm their email</button>
              <button type="button" disabled={busy} className={action} onClick={() => run('/resend-code', 'POST', undefined, `A new code was sent to ${u.email}.`)}>Send a new code</button>
            </>}
            {u.role === 'employer' && (
              <label className="flex items-center gap-2 text-xs text-slate-600">
                Plan
                <select value={u.plan} disabled={busy || u.paddle} title={u.paddle ? 'Pays through Paddle: change it in Paddle' : undefined}
                  onChange={(e) => run('/plan', 'PUT', { plan: e.target.value }, `Plan changed to ${e.target.value}.`)}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold disabled:opacity-60">
                  {['free', 'pro', 'premium'].map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
                </select>
                {u.paddle && <span className="text-slate-500">Pays through Paddle: change it there</span>}
              </label>
            )}
            <span className="flex-1" />
            <button type="button" disabled={busy} onClick={() => setSuspending(true)}
              className={u.suspended_at ? action : 'rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50'}>
              {u.suspended_at ? 'Lift suspension' : 'Suspend'}
            </button>
            <button type="button" disabled={busy} onClick={() => setDeleting(true)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">Delete account</button>
          </div>
        </section>
      )}

      {!gone && <TeamMessages userId={u.id} name={u.name} suspended={!!u.suspended_at} onSent={load} />}

      <div className="grid gap-4 lg:grid-cols-2">
        {u.role === 'employer' ? (
          <List title={`Jobs · ${d.jobs.length}`} empty="No jobs posted.">
            {d.jobs.map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <a href={`/jobs/${j.id}`} target="_blank" rel="noreferrer" className="truncate font-medium text-slate-900 hover:underline">{j.title}</a>
                <span className="shrink-0 text-xs text-slate-500">{j.applicants} applied · {j.closed_at ? 'closed' : 'open'} · {ago(j.created_at)}</span>
              </li>
            ))}
          </List>
        ) : (
          <List title={`Applications · ${d.applications.length}`} empty="No applications yet.">
            {d.applications.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <a href={`/jobs/${a.job_id}`} target="_blank" rel="noreferrer" className="truncate font-medium text-slate-900 hover:underline">{a.job_title}</a>
                <span className="shrink-0 text-xs text-slate-500">{a.employer} · {a.credits} credits · {ago(a.created_at)}</span>
              </li>
            ))}
          </List>
        )}
        <List title={`Support · ${d.tickets.length}`} empty="They haven’t contacted us.">
          {d.tickets.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <Link href={`/admin/feedback/${t.id}`} className="truncate font-medium text-slate-900 hover:underline">#{t.id} {t.subject}</Link>
              <span className="shrink-0 text-xs text-slate-500">{t.done_at ? 'resolved' : 'open'} · {ago(t.created_at)}</span>
            </li>
          ))}
        </List>
        <List title="History" empty="Nothing done by the admin yet.">
          {d.actions.map((a, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span><b className="font-medium text-slate-900">{a.action}</b>{a.detail && <span className="text-slate-500"> · {a.detail}</span>}</span>
              <span className="shrink-0 text-xs text-slate-500" title={new Date(a.at).toLocaleString()}>{ago(a.at)}</span>
            </li>
          ))}
        </List>
      </div>

      {suspending && <SuspendDialog user={u} onClose={() => setSuspending(false)}
        onDone={() => { setSuspending(false); load(); }} onError={(e) => { setSuspending(false); failed(logout, setError)(e); }} />}
      {deleting && <DeleteDialog name={u.name} paid={u.paddle} busy={busy} onClose={() => setDeleting(false)}
        onConfirm={async () => { await run('', 'DELETE', { confirm: 'DELETE' }, 'Account deleted.'); setDeleting(false); }} />}
    </>
  );
}

// Messages from the ReadyToWork.ph Team: they arrive in the person's Messages (and as the usual "new message"
// email); their replies show up here. Opening this marks their replies read.
function TeamMessages({ userId, name, suspended, onSent }: { userId: number; name: string; suspended: boolean; onSent: () => void }) {
  const { logout, refreshCounts } = useAdmin();
  const [thread, setThread] = useState<{ id: number; from_team: boolean; body: string; created_at: string; read_at: string | null }[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(() => adminApi<NonNullable<typeof thread>>(`/users/${userId}/messages`).then((t) => { setThread(t); refreshCounts(); }, failed(logout, setError)), [userId, logout, refreshCounts]);
  useEffect(() => { load(); }, [load]);
  async function send() {
    setBusy(true); setError('');
    try { await adminApi(`/users/${userId}/message`, 'POST', { body: draft }); setDraft(''); await load(); onSent(); }
    catch (err) { failed(logout, setError)(err as Error); } finally { setBusy(false); }
  }
  const first = name.split(' ')[0];
  return (
    <section id="messages" className={`${card} space-y-3`}>
      <h2 className="text-sm font-semibold text-slate-900">Messages from ReadyToWork.ph Team</h2>
      {thread?.length ? (
        <div className="max-h-96 space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-3">
          {thread.map((m) => (
            <div key={m.id} className={`flex flex-col ${m.from_team ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2 text-sm ${m.from_team ? 'rounded-br-md bg-emerald-950 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'}`}>{m.body}</div>
              <span className="mt-0.5 px-1 text-[11px] text-slate-400">{m.from_team ? 'Team' : first} · {ago(m.created_at)}{m.from_team && m.read_at ? ' · Seen' : ''}</span>
            </div>
          ))}
        </div>
      ) : <p className="text-sm text-slate-500">{thread ? `No messages with ${first} yet.` : 'Loading…'}</p>}
      {suspended ? <p className="text-sm text-slate-500">This account is suspended, so they can’t read messages.</p> : <>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} maxLength={5000} placeholder={`Write to ${first}…`} aria-label={`Message ${name}`}
          className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">It shows in their Messages as <b>ReadyToWork.ph Team</b> (marked Official), and they get an email. They can reply.</p>
          <button type="button" disabled={busy || !draft.trim()} onClick={send} className="rounded-full bg-emerald-950 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-50">{busy ? 'Sending…' : 'Send message'}</button>
        </div>
      </>}
      <ErrorText msg={error} />
    </section>
  );
}

function List({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section className={card}>
      <h2 className="mb-1 text-sm font-semibold text-slate-900">{title}</h2>
      {children.length ? <ul className="divide-y divide-slate-100">{children}</ul> : <p className="py-2 text-sm text-slate-500">{empty}</p>}
    </section>
  );
}

// Deleting can't be undone, so it asks for DELETE to be typed, like the person's own "Delete my account".
function DeleteDialog({ name, paid, busy, onClose, onConfirm }: { name: string; paid: boolean; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const [typed, setTyped] = useState('');
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="del-title"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className={`${card} w-full max-w-md space-y-3`}>
        <h2 id="del-title" className="text-lg font-bold">Delete {name}’s account?</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>Only do this when they asked (Data Privacy Act). It can’t be undone.</li>
          {paid && <li>Their paid plan is cancelled at Paddle first.</li>}
          <li>Their profile, jobs, files and email are removed; chats show “Deleted user”.</li>
        </ul>
        <label className="block text-sm text-slate-700">Type <b className="font-mono">DELETE</b> to confirm
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono" />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={busy || typed !== 'DELETE'} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            {busy ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </div>
    </div>
  );
}
