'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, useApi, type Conversation, type Job, type Thread } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ErrorText, Initials, TimeAgo, button } from '@/components/ui';

export default function MessagesPage() {
  const { user, ready } = useAuth();
  const params = useSearchParams();
  const withId = params.get('with');
  const jobId = params.get('job');
  const { data: inbox, reload: reloadInbox } = useApi<Conversation[]>(user ? '/messages' : null, 15000);

  if (ready && !user) return <p><Link href="/login?next=/messages" className="font-medium text-emerald-800 underline">Log in</Link> to see your messages.</p>;
  if (!user) return null;

  return (
    <div className="grid h-[calc(100vh-11rem)] min-h-[32rem] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:grid-cols-[20rem_minmax(0,1fr)]">
      <aside className={`flex min-h-0 flex-col border-slate-200 md:border-r ${withId ? 'hidden md:flex' : 'flex'}`}>
        <h1 className="border-b border-slate-200 px-5 py-4 text-lg font-bold">Messages</h1>
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
            <li key={c.user_id}>
              <Link href={`/messages?with=${c.user_id}`}
                className={`flex gap-3 border-b border-slate-100 px-5 py-4 transition hover:bg-slate-50 ${String(c.user_id) === withId ? 'bg-emerald-50/70' : ''}`}>
                <Initials name={c.name} id={c.user_id} size="h-10 w-10 text-sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate ${c.unread ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'}`}>{c.name}</span>
                    <span className="shrink-0 text-xs text-slate-400"><TimeAgo date={c.last_at} /></span>
                  </span>
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
    <>
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
          <Link href={`/workers/${other.id}`} className="ml-auto rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-emerald-600 hover:text-emerald-800">View profile</Link>
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

      {thread.can_send ? (
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
    </>
  );
}
