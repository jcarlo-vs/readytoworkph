'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, useApi, type Applied, type Conversation, type Job, type Thread } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ErrorText, Initials, TimeAgo, button, scoreBand } from '@/components/ui';
import { useModal } from '@/components/useModal';

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

  // Employers: filter the list by job (who applied to it), or the people they reached out to first.
  const [filter, setFilter] = useState<'all' | 'unread' | 'out' | number>('all');
  const [clearing, setClearing] = useState<number | null>(null); // job whose chats are being removed from the list
  const byJob = jobFolders(inbox ?? []);
  const reachedOut = (inbox ?? []).filter((c) => c.applied?.length === 0 && c.role === 'worker');
  const unread = (inbox ?? []).filter((c) => c.unread > 0 || String(c.user_id) === withId); // the open chat stays while you read it
  const folder = typeof filter === 'number' && byJob.find((j) => j.id === filter);
  const shown = filter === 'all' ? inbox : filter === 'unread' ? unread : filter === 'out' ? reachedOut : folder ? folder.people : [];
  const jobsNav = user?.role === 'employer' && !!inbox?.length;
  // Picking a folder while a chat is open goes back to the list, filtered.
  const pick = (f: typeof filter) => { setFilter(f); if (withId) router.push('/messages'); };

  if (ready && !user) return <p><Link href="/login?next=/messages" className="font-medium text-emerald-800 underline">Log in</Link> to see your messages.</p>;
  if (!user) return null;

  return (
    <div data-wide className={`grid h-[calc(100vh-11rem)] min-h-[32rem] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${jobsNav ? 'lg:grid-cols-[14rem_minmax(0,1fr)]' : ''}`}>
      {jobsNav && (
        <nav aria-label="Filter by job" className="hidden min-h-0 flex-col gap-0.5 overflow-y-auto border-r border-slate-200 bg-slate-50/60 p-2 lg:flex">
          <FolderButton label="All messages" count={inbox.length} active={filter === 'all'} onClick={() => pick('all')} />
          <FolderButton label="Unread" count={unread.length} active={filter === 'unread'} onClick={() => pick('unread')} />
          {byJob.length > 0 && <p className="px-2.5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Job posts</p>}
          {byJob.map((j) => (
            <FolderButton key={j.id} label={j.title} count={j.people.length} active={filter === j.id} onClick={() => pick(j.id)}
              onRemove={() => setClearing(j.id)} />
          ))}
          {reachedOut.length > 0 && <>
            <p className="px-2.5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Other</p>
            <FolderButton label="You reached out" count={reachedOut.length} active={filter === 'out'} onClick={() => pick('out')} />
          </>}
        </nav>
      )}
      {/* Like an email inbox: the list fills the space, and opening a chat shows it in the list's place. */}
      <aside className={`min-h-0 flex-col ${withId ? 'hidden' : 'flex'}`}>
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
          <h1 className="py-1 text-lg font-bold">Messages</h1>
          {jobsNav && (
            <select value={String(filter)} onChange={(e) => { const v = e.target.value; pick(v === 'all' || v === 'unread' || v === 'out' ? v : Number(v)); }}
              aria-label="Filter by job" className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 lg:hidden">
              <option value="all">All messages ({inbox.length})</option>
              <option value="unread">Unread ({unread.length})</option>
              {byJob.map((j) => <option key={j.id} value={j.id}>{j.title} ({j.people.length})</option>)}
              {reachedOut.length > 0 && <option value="out">You reached out ({reachedOut.length})</option>}
            </select>
          )}
          {!!inbox?.length && (picked
            ? <button type="button" onClick={stopSelecting} className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
            : <button type="button" onClick={() => setPicked(new Set())} className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">Select</button>)}
        </div>
        {folder && (
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-5 py-2 text-xs lg:hidden">
            <span className="truncate text-slate-600">{folder.people.length} {folder.people.length === 1 ? 'person' : 'people'} applied</span>
            <button type="button" onClick={() => setClearing(folder.id)} className="shrink-0 font-semibold text-red-700 hover:underline">Remove from Messages</button>
          </div>
        )}
        {picked && shown && (
          <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-5 py-2 text-sm">
            <label className="flex items-center gap-2 font-medium text-slate-700">
              <input type="checkbox" className="size-4 accent-emerald-700" checked={picked.size === shown.length && shown.length > 0}
                onChange={(e) => setPicked(new Set(e.target.checked ? shown.map((c) => c.user_id) : []))} />
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
          {inbox && inbox.length > 0 && shown?.length === 0 && <li className="p-5 text-sm text-slate-500">{filter === 'unread' ? 'You’re all caught up.' : 'No one here anymore.'}</li>}
          {shown?.map((c) => (
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
                    {c.role === 'team' && <Official />}
                    {c.deactivated && <span className="shrink-0 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">Deactivated</span>}
                    <span className="shrink-0 text-xs text-slate-400"><TimeAgo date={c.last_at} /></span>
                  </span>
                  {c.applied && c.role === 'worker' && (c.applied.length ? (
                    <span className="block truncate text-xs font-medium text-emerald-700">
                      {(c.applied.find((a) => a.job_id === filter) ?? c.applied[0]).title}{c.applied.length > 1 && ` · +${c.applied.length - 1} job${c.applied.length > 2 ? 's' : ''}`}
                    </span>
                  ) : <span className="block truncate text-xs text-slate-400">Hasn’t applied · you reached out</span>)}
                  {c.role === 'employer' && c.first_job && <span className="block truncate text-xs font-medium text-emerald-700">{c.first_job.title}</span>}
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

      {clearing !== null && (
        <ClearJob job={byJob.find((j) => j.id === clearing)} onClose={() => setClearing(null)}
          onDone={(ids) => {
            if (withId && ids.includes(Number(withId))) router.push('/messages');
            setClearing(null); setFilter('all'); reloadInbox();
            window.dispatchEvent(new Event('rp:unread-changed'));
          }} />
      )}
      {withId && (
        <section className="flex min-h-0 flex-col">
          <ThreadView key={withId} otherId={withId} jobId={jobId} myId={user.id} onSent={reloadInbox} {...nextPrev(shown ?? [], withId)} />
        </section>
      )}
    </div>
  );
}

// The people before and after this one in the list as it's filtered now, for the ‹ › buttons.
function nextPrev(list: Conversation[], withId: string) {
  const i = list.findIndex((c) => String(c.user_id) === withId);
  return { prevId: i > 0 ? list[i - 1].user_id : null, nextId: i >= 0 && i < list.length - 1 ? list[i + 1].user_id : null };
}

function ThreadView({ otherId, jobId, myId, onSent, prevId, nextId }: { otherId: string; jobId: string | null; myId: number; onSent: () => void; prevId: number | null; nextId: number | null }) {
  const { data: thread, error, reload } = useApi<Thread>(`/messages/${otherId}`, 10_000);
  const { data: job } = useApi<Job>(jobId ? `/jobs/${jobId}` : null);
  const [draft, setDraft] = useState('');
  const [details, setDetails] = useState(false); // worker details slide over the chat on smaller screens (always shown on wide ones)
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
  const firstJob = thread.messages.find((m) => m.job_id && m.job_title);

  return (
    <div className="relative flex min-h-0 flex-1">
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-slate-200 px-5 py-3">
        <Link href="/messages" aria-label="Back to conversations" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5l-5 5 5 5" /></svg>
        </Link>
        <Initials name={other.name} id={other.id} size="h-10 w-10 text-sm" />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate font-semibold">{other.name}{other.role === 'team' && <Official />}</p>
          <p className="text-xs capitalize text-slate-500">{other.role === 'team' ? 'Official messages from ReadyToWork.ph' : other.role}</p>
        </div>
        {other.role === 'worker' && (
          thread.applied
            ? <button type="button" onClick={() => setDetails(!details)} aria-expanded={details} className={`ml-auto rounded-lg border px-3 py-1.5 text-xs font-semibold xl:hidden ${details ? 'border-emerald-600 text-emerald-800' : 'border-slate-200 text-slate-700 hover:border-emerald-600 hover:text-emerald-800'}`}>Details</button>
            : <Link href={`/workers/${other.id}`} className="ml-auto rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-emerald-600 hover:text-emerald-800">View profile</Link>
        )}
        <span className={`flex gap-1 ${other.role === 'worker' ? '' : 'ml-auto'}`}>
          {([[prevId, 'Previous person', 'M12 5l-5 5 5 5'], [nextId, 'Next person', 'M8 5l5 5-5 5']] as const).map(([id, label, d]) => {
            const icon = <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
            return id
              ? <Link key={label} href={`/messages?with=${id}`} aria-label={label} title={label} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100">{icon}</Link>
              : <span key={label} className="p-1.5 text-slate-300">{icon}</span>;
          })}
        </span>
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

      {firstJob && (
        <p className="truncate border-t border-slate-200 bg-slate-50 px-5 py-2 text-xs text-slate-500">
          First contacted for job:{' '}
          <Link href={`/jobs/${firstJob.job_id}`} target="_blank" rel="noopener" className="font-semibold text-emerald-800 hover:underline">{firstJob.job_title}</Link>
        </p>
      )}

      {thread.user.status ? (
        <p className="border-t border-slate-200 p-4 text-center text-sm text-slate-500">
          {thread.user.status === 'deleted' ? 'This person deleted their account. You can still read your conversation.'
            : thread.user.status === 'suspended' ? 'This account has been suspended. You can still read your conversation.'
            : `${other.name.split(' ')[0]} has paused their account, so they can’t get new messages right now.`}
        </p>
      ) : thread.can_send ? (
        <form onSubmit={send} className="space-y-2 border-t border-slate-200 p-4">
          {job && job.id !== firstJob?.job_id && <p className="text-xs text-slate-500">About: <Link href={`/jobs/${job.id}`} target="_blank" rel="noopener" className="font-semibold text-emerald-800 hover:underline">{job.title}</Link></p>}
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
            {thread.free_messaging === false ? <>Messaging applicants is part of Pro and Premium.{' '}
              <Link href="/pricing" className="font-semibold text-emerald-800 hover:underline">Upgrade</Link> to message {other.name.split(' ')[0]}.</>
              : <>On the Free plan you can message workers who applied to your jobs.{' '}
              <Link href="/pricing" className="font-semibold text-emerald-800 hover:underline">Upgrade to Pro</Link> to reach out to any worker first.</>}
          </p>
        ) : (
          <p className="border-t border-slate-200 p-4 text-center text-sm text-slate-500">You can reply once this employer messages you.</p>
        )
      )}
    </div>
    {thread.applied && <WorkerPanel user={other} applied={thread.applied} canSend={thread.can_send} onSent={() => { reload(); onSent(); }} shown={details} onClose={() => setDetails(false)} />}
    </div>
  );
}

// Employers only, on wide screens: who this worker is and every job of yours they applied to, newest first.
// Each card opens them on that job's applicants page with their details open.
function WorkerPanel({ user, applied, canSend, onSent, shown, onClose }: { user: Thread['user']; applied: Applied[]; canSend: boolean; onSent: () => void; shown: boolean; onClose: () => void }) {
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
    <aside aria-label={`About ${user.name}`} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      className={`${shown ? 'absolute inset-y-0 right-0 z-10 flex shadow-2xl' : 'hidden'} w-72 max-w-full shrink-0 flex-col gap-4 overflow-y-auto border-l border-slate-200 bg-white p-5 xl:static xl:flex xl:bg-slate-50/40 xl:shadow-none`}>
      <button type="button" onClick={onClose} aria-label="Close details" className="absolute top-3 right-3 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 xl:hidden">
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" /></svg>
      </button>
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

// The ReadyToWork.ph Team account (messages from the admin): marked so nobody mistakes an employer for us.
function Official() {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-700 px-1.5 py-0.5 text-[10px] font-bold text-white" title="Official message from ReadyToWork.ph">
      <svg viewBox="0 0 20 20" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 10l4 4 8-8" /></svg>
      Official
    </span>
  );
}

type Folder = { id: number; title: string; people: Conversation[] };

// One folder per job that someone in the list applied to (newest application first), with those people.
// Someone who applied to two jobs is in both.
function jobFolders(inbox: Conversation[]): Folder[] {
  const by = new Map<number, Folder>();
  for (const c of inbox) for (const a of c.applied ?? []) {
    const f = by.get(a.job_id) ?? by.set(a.job_id, { id: a.job_id, title: a.title, people: [] }).get(a.job_id)!;
    if (!f.people.includes(c)) f.people.push(c);
  }
  return [...by.values()];
}

function FolderButton({ label, count, active, onClick, onRemove }: { label: string; count: number; active: boolean; onClick: () => void; onRemove?: () => void }) {
  return (
    <div className={`group flex items-center rounded-lg ${active ? 'bg-emerald-50 text-emerald-900' : 'text-slate-600 hover:bg-white'}`}>
      <button type="button" onClick={onClick} aria-pressed={active} title={label}
        className={`flex min-w-0 flex-1 items-center justify-between gap-2 px-2.5 py-2 text-left text-sm ${active ? 'font-semibold' : ''}`}>
        <span className="truncate">{label}</span>
        <span className="shrink-0 text-xs text-slate-400">{count}</span>
      </button>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${label} from Messages`} title="Remove from Messages"
          className="mr-1 rounded-md p-1 text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-700 focus-visible:opacity-100 group-hover:opacity-100">
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" /></svg>
        </button>
      )}
    </div>
  );
}

// "Remove from Messages" for one job: hides the chats with everyone who applied to it (the same as Select ›
// Remove). Applications, the job post and the workers' side of the chat all stay.
function ClearJob({ job, onClose, onDone }: { job?: Folder; onClose: () => void; onDone: (ids: number[]) => void }) {
  const dialog = useModal(!!job, onClose);
  const [state, setState] = useState({ busy: false, error: '' });
  if (!job) return null;
  const alsoElsewhere = job.people.filter((c) => (c.applied?.length ?? 0) > 1);
  async function remove() {
    const ids = job!.people.map((c) => c.user_id);
    setState({ busy: true, error: '' });
    try {
      await api('/messages/hide', { body: { user_ids: ids } });
      onDone(ids);
    } catch (err) {
      setState({ busy: false, error: (err as Error).message });
    }
  }
  const n = job.people.length;
  return (
    <dialog ref={dialog} onClose={onClose} aria-labelledby="clear-job-title" onClick={(e) => { if (e.target === dialog.current) onClose(); }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl p-6 shadow-2xl backdrop:bg-slate-950/50">
      <h2 id="clear-job-title" className="text-lg font-bold text-slate-900">Remove “{job.title}” from Messages?</h2>
      <p className="mt-2 text-sm text-slate-600">
        This removes your {n === 1 ? 'chat' : `${n} chats`} with {n === 1 ? 'the person' : 'everyone'} who applied to this job from your Messages list.
      </p>
      <ul className="mt-3 space-y-1 text-sm text-slate-600">
        <li>✓ Their applications stay on the job’s Applicants page.</li>
        <li>✓ The job post stays as it is.</li>
        <li>✓ Workers keep their side of the chat. If they write again, they show up here again.</li>
      </ul>
      {alsoElsewhere.length > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {alsoElsewhere.map((c) => c.name).join(', ')} also applied to another of your jobs, so they’ll be removed from that list too.
        </p>
      )}
      <div className="mt-5 flex gap-2">
        <button type="button" onClick={remove} disabled={state.busy} className="flex-1 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
          {state.busy ? 'Removing…' : `Remove ${n === 1 ? 'chat' : `${n} chats`}`}
        </button>
        <button type="button" onClick={onClose} className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Keep</button>
      </div>
      <ErrorText msg={state.error} />
    </dialog>
  );
}
