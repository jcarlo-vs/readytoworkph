'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, useApi, type Applied, type Conversation, type Job, type Thread } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ErrorText, Initials, TimeAgo, button, scoreBand } from '@/components/ui';

export default function MessagesPage() {
  const { user, ready } = useAuth();
  const params = useSearchParams();
  const withId = params.get('with');
  const jobId = params.get('job');
  const { data: inbox, reload: reloadInbox } = useApi<Conversation[]>(user ? '/messages' : null, 15000);
  const router = useRouter();
  // Removing people from the list: tick one or many, then confirm. Messages themselves are never deleted.
  const [picked, setPicked] = useState<Set<number> | null>(null); // null = not selecting
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState({ busy: false, error: '' });
  const toggle = (id: number) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const stopSelecting = () => { setPicked(null); setConfirming(false); setRemoving({ busy: false, error: '' }); };
  async function remove() {
    if (!picked?.size) return;
    setRemoving({ busy: true, error: '' });
    try {
      await api('/messages/hide', { body: { user_ids: [...picked] } });
      if (withId && picked.has(Number(withId))) router.push('/messages');
      stopSelecting();
      reloadInbox();
      window.dispatchEvent(new Event('rp:unread-changed'));
    } catch (err) {
      setRemoving({ busy: false, error: (err as Error).message });
    }
  }

  if (ready && !user) return <p><Link href="/login?next=/messages" className="font-medium text-emerald-800 underline">Log in</Link> to see your messages.</p>;
  if (!user) return null;

  return (
    <div className="grid h-[calc(100vh-11rem)] min-h-[32rem] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:grid-cols-[20rem_minmax(0,1fr)]">
      <aside className={`flex min-h-0 flex-col border-slate-200 md:border-r ${withId ? 'hidden md:flex' : 'flex'}`}>
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
          <h1 className="py-1 text-lg font-bold">Messages</h1>
          {!!inbox?.length && (picked
            ? <button type="button" onClick={stopSelecting} className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
            : <button type="button" onClick={() => setPicked(new Set())} className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">Select</button>)}
        </div>
        {picked && inbox && (
          <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-5 py-2 text-sm">
            <label className="flex items-center gap-2 font-medium text-slate-700">
              <input type="checkbox" className="size-4 accent-emerald-700" checked={picked.size === inbox.length && inbox.length > 0}
                onChange={(e) => setPicked(new Set(e.target.checked ? inbox.map((c) => c.user_id) : []))} />
              {picked.size ? `${picked.size} selected` : 'Select all'}
            </label>
          </div>
        )}
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {inbox?.length === 0 && (
            <li className="p-5 text-sm text-slate-500">
              No messages yet.{' '}
              {user.role === 'employer'
                ? <>Find someone on <Link href="/workers" className="font-medium text-emerald-800 underline">Hire Talent</Link> and send them a message.</>
                : 'Employers will reach out here about your applications.'}
            </li>
          )}
          {inbox?.map((c) => (
            <li key={c.user_id} className={picked ? 'flex items-center border-b border-slate-100 pl-5' : ''}>
              {picked && (
                <input type="checkbox" className="size-4 shrink-0 accent-emerald-700" checked={picked.has(c.user_id)} onChange={() => toggle(c.user_id)}
                  aria-label={`Select ${c.name}`} />
              )}
              <Link href={`/messages?with=${c.user_id}`}
                onClick={picked ? (e) => { e.preventDefault(); toggle(c.user_id); } : undefined}
                className={`flex min-w-0 flex-1 gap-3 px-5 py-4 transition hover:bg-slate-50 ${picked ? 'pl-3' : 'border-b border-slate-100'} ${String(c.user_id) === withId || picked?.has(c.user_id) ? 'bg-emerald-50/70' : ''}`}>
                <Initials name={c.name} id={c.user_id} size="h-10 w-10 text-sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate ${c.unread ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'}`}>{c.name}</span>
                    {c.deactivated && <span className="shrink-0 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">Deactivated</span>}
                    <span className="shrink-0 text-xs text-slate-400"><TimeAgo date={c.last_at} /></span>
                  </span>
                  {c.applied && c.role === 'worker' && (c.applied.length ? (
                    <span className="block truncate text-xs font-medium text-emerald-700">
                      {c.applied[0].title}{c.applied.length > 1 && ` · +${c.applied.length - 1} job${c.applied.length > 2 ? 's' : ''}`}
                    </span>
                  ) : <span className="block truncate text-xs text-slate-400">Hasn’t applied · you reached out</span>)}
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className={`truncate text-sm ${c.unread ? 'font-medium text-slate-800' : 'text-slate-500'}`}>
                      {c.last_from_me && 'You: '}{c.last_body}
                    </span>
                    {c.unread > 0 && <span className="ml-auto shrink-0 rounded-full bg-emerald-700 px-2 py-0.5 text-xs font-bold text-white">{c.unread}</span>}
                  </span>

                </span>
              </Link>
            </li>
          ))}
        </ul>
        {picked && (
          <div className="space-y-2 border-t border-slate-200 p-4">
            {confirming ? (
              <>
                <p className="text-sm text-slate-700">Remove {picked.size} {picked.size === 1 ? 'person' : 'people'} from your list? Your messages stay, and if they write again they’ll show up here again.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={remove} disabled={removing.busy} className="flex-1 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                    {removing.busy ? 'Removing…' : 'Remove'}
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Keep</button>
                </div>
                <ErrorText msg={removing.error} />
              </>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} disabled={!picked.size}
                className="w-full rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40">
                Remove from list{picked.size ? ` (${picked.size})` : ''}
              </button>
            )}
          </div>
        )}
      </aside>

      <section className={`min-h-0 flex-col ${withId ? 'flex' : 'hidden md:flex'}`}>
        {withId
          ? <ThreadView key={withId} otherId={withId} jobId={jobId} myId={user.id} onSent={reloadInbox} />
          : <div className="m-auto max-w-xs p-6 text-center text-sm text-slate-500">Choose a conversation to read it here.</div>}
      </section>
    </div>
  );
}

function ThreadView({ otherId, jobId, myId, onSent }: { otherId: string; jobId: string | null; myId: number; onSent: () => void }) {
  const { data: thread, error, reload } = useApi<Thread>(`/messages/${otherId}`, 10_000);
  const { data: job } = useApi<Job>(jobId ? `/jobs/${jobId}` : null);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState({ busy: false, error: '' });
  const bottom = useRef<HTMLDivElement>(null);
  const count = thread?.messages.length ?? 0;

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [count]);
  // Opening a thread marks it read; tell the nav badge to refresh.
  useEffect(() => { if (thread) window.dispatchEvent(new Event('rp:unread-changed')); }, [thread]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!draft.trim() || status.busy) return;
    setStatus({ busy: true, error: '' });
    try {
      await api(`/messages/${otherId}`, { body: { body: draft, ...(job && { job_id: job.id }) } });
      setDraft('');
      setStatus({ busy: false, error: '' });
      reload();
      onSent();
    } catch (err) {
      setStatus({ busy: false, error: (err as Error).message });
    }
  }

  if (error) return <div className="m-auto p-6"><ErrorText msg={error} /></div>;
  if (!thread) return <p className="m-auto text-sm text-slate-500">Loading…</p>;
  const other = thread.user;

  return (
    <div className="flex min-h-0 flex-1">
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-slate-200 px-5 py-3">
        <Link href="/messages" aria-label="Back to conversations" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden">
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5l-5 5 5 5" /></svg>
        </Link>
        <Initials name={other.name} id={other.id} size="h-10 w-10 text-sm" />
        <div className="min-w-0">
          <p className="truncate font-semibold">{other.name}</p>
          <p className="text-xs capitalize text-slate-500">{other.role}</p>
        </div>
        {other.role === 'worker' && (
          <Link href={`/workers/${other.id}`} className={`${thread.applied ? 'xl:hidden ' : ''}ml-auto rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-emerald-600 hover:text-emerald-800`}>View profile</Link>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/60 px-5 py-5">
        {count === 0 && <p className="pt-10 text-center text-sm text-slate-500">Start the conversation with {other.name.split(' ')[0]}.</p>}
        {thread.messages.map((m) => {
          const mine = m.sender_id === myId;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${mine ? 'rounded-br-md bg-emerald-950 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'}`}>
                {m.job_title && (
                  <p className={`mb-1 text-xs font-semibold ${mine ? 'text-amber-300' : 'text-emerald-800'}`}>Re: {m.job_title}</p>
                )}
                <p className="whitespace-pre-line break-words">{m.body}</p>
              </div>
              <span className="mt-1 px-1 text-[11px] text-slate-400">
                <TimeAgo date={m.created_at} />{mine && m.read_at && ' · Seen'}
              </span>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      {thread.user.status ? (
        <p className="border-t border-slate-200 p-4 text-center text-sm text-slate-500">
          {thread.user.status === 'deleted' ? 'This person deleted their account. You can still read your conversation.'
            : thread.user.status === 'suspended' ? 'This account has been suspended. You can still read your conversation.'
            : `${other.name.split(' ')[0]} has paused their account, so they can’t get new messages right now.`}
        </p>
      ) : thread.can_send ? (
        <form onSubmit={send} className="space-y-2 border-t border-slate-200 p-4">
          {job && <p className="text-xs text-slate-500">About: <span className="font-semibold text-emerald-800">{job.title}</span></p>}
          <div className="flex items-end gap-2">
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} aria-label={`Message ${other.name}`}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) send(e); }}
              placeholder={`Write a message to ${other.name.split(' ')[0]}…`}
              className="max-h-40 min-h-11 flex-1 resize-y rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20" />
            <button className={`${button} h-11`} disabled={status.busy || !draft.trim()}>Send</button>
          </div>
          <div className="flex justify-between gap-2">
            <ErrorText msg={status.error} />
            <span className="ml-auto text-[11px] text-slate-400">Enter to send · Shift+Enter for a new line</span>
          </div>
        </form>
      ) : (
        other.role === 'worker' ? (
          <p className="border-t border-slate-200 p-4 text-center text-sm text-slate-500">
            On the Free plan you can message workers who applied to your jobs.{' '}
            <Link href="/pricing" className="font-semibold text-emerald-800 hover:underline">Upgrade to Pro</Link> to reach out to any worker first.
          </p>
        ) : (
          <p className="border-t border-slate-200 p-4 text-center text-sm text-slate-500">You can reply once this employer messages you.</p>
        )
      )}
    </div>
    {thread.applied && <WorkerPanel user={other} applied={thread.applied} canSend={thread.can_send} onSent={() => { reload(); onSent(); }} />}
    </div>
  );
}

// Employers only, on wide screens: who this worker is and every job of yours they applied to, newest first.
// Each card opens them on that job's applicants page with their details open.
function WorkerPanel({ user, applied, canSend, onSent }: { user: Thread['user']; applied: Applied[]; canSend: boolean; onSent: () => void }) {
  const first = user.name.split(' ')[0];
  // Nothing applied yet: offer the employer's open jobs to send as a link (only then is the list fetched).
  const { data: jobs } = useApi<Job[]>(applied.length === 0 && canSend && !user.status ? '/my/jobs' : null);
  const open = jobs?.filter((j) => !j.closed_at) ?? [];
  const [sent, setSent] = useState<Record<number, 'busy' | 'done'>>({});
  const [inviteError, setInviteError] = useState('');
  async function invite(job: Job) {
    setSent((s) => ({ ...s, [job.id]: 'busy' })); setInviteError('');
    try {
      await api(`/messages/${user.id}`, { body: { job_id: job.id, body: `Hi ${first}! I think you’d be a great fit for this job. Have a look and apply here: ${location.origin}/jobs/${job.id}` } });
      setSent((s) => ({ ...s, [job.id]: 'done' }));
      onSent();
    } catch (err) {
      setSent((s) => { const n = { ...s }; delete n[job.id]; return n; });
      setInviteError((err as Error).message);
    }
  }
  return (
    <aside aria-label={`About ${user.name}`} className="hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-slate-200 bg-slate-50/40 p-5 xl:flex">
      <div className="text-center">
        <Initials name={user.name} id={user.id} size="mx-auto h-16 w-16 text-lg" />
        <p className="mt-2 font-semibold text-slate-900">{user.name}</p>
        <p className="text-xs text-slate-500">{[user.title, user.hourly_rate && `$${Number(user.hourly_rate)}/hr`].filter(Boolean).join(' · ') || 'Worker'}</p>
      </div>
      {!user.status && <Link href={`/workers/${user.id}`} className="rounded-lg border border-slate-200 bg-white py-2 text-center text-xs font-semibold text-slate-700 hover:border-emerald-600 hover:text-emerald-800">View full profile</Link>}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Applied to your jobs · {applied.length}</p>
        {applied.length === 0 && (
          <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-emerald-700" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12l16-8-6 16-3-6z" /></svg>
            <p className="text-sm font-semibold text-slate-900">You reached out first</p>
            <p className="text-xs text-slate-500">{first} hasn’t applied to any of your jobs.</p>
          </div>
        )}
        {applied.map((a) => {
          const b = a.score === null ? null : scoreBand(a.score);
          const tag = a.hired ? ['Hired', 'bg-emerald-100 text-emerald-900'] : a.messaged ? ['Messaged', 'bg-emerald-50 text-emerald-800'] : a.recent ? ['New', 'bg-amber-100 text-amber-900'] : null;
          return (
            <Link key={a.application_id} href={`/dashboard/jobs/${a.job_id}#applicant-${a.application_id}`}
              className="block rounded-xl border border-slate-200 bg-white p-3 transition hover:border-emerald-600">
              <span className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900">{a.title}</span>
                {tag && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tag[1]}`}>{tag[0]}</span>}
              </span>
              <span className="block text-xs text-slate-500">Applied <TimeAgo date={a.created_at} /> · {a.credits} credit{a.credits === 1 ? '' : 's'}</span>
              <span className="mt-1.5 flex items-center justify-between text-xs">
                <span className={`font-semibold ${b ? b.text : 'text-slate-400'}`}>{b ? `Smart Score ${a.score} · ${b.label}` : 'Not scored yet'}</span>
                <span className="font-semibold text-emerald-700">Open ›</span>
              </span>
            </Link>
          );
        })}
      </div>
      {open.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Invite to apply</p>
          <p className="text-xs text-slate-500">Send {first} one of your open jobs. When they apply, you’ll see their cover letter and can get a Smart Score.</p>
          {open.map((j) => (
            <button key={j.id} type="button" onClick={() => invite(j)} disabled={!!sent[j.id]}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs transition hover:border-emerald-600 disabled:hover:border-slate-200">
              <span className="truncate font-semibold text-slate-900">{j.title}</span>
              <span className={`shrink-0 font-semibold ${sent[j.id] === 'done' ? 'text-slate-500' : 'text-emerald-700'}`}>{sent[j.id] === 'done' ? '✓ Sent' : sent[j.id] ? 'Sending…' : 'Send link'}</span>
            </button>
          ))}
          <ErrorText msg={inviteError} />
        </div>
      )}
    </aside>
  );
}
