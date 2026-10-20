'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, useApi, type User } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ErrorText, Initials, PageBand, button, buttonGhost, card, input } from '@/components/ui';
import { PhotoCard } from '@/components/PhotoCard';

// Account settings: the email you sign in with, and deleting the account (Data Privacy Act: right to erasure).
export default function AccountPage() {
  const { user, ready, signOut, signIn } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pause, setPause] = useState(false);
  const { data: me } = useApi<User>(user ? '/me' : null); // fresh sign-in details (Google, password, confirmed)

  if (ready && !user) return <p><Link href="/login?next=/account" className="text-emerald-700 underline">Log in</Link> to see your account settings.</p>;
  if (!user) return <p className="text-slate-500">Loading…</p>;
  const employer = user.role === 'employer';
  const paid = employer && user.plan && user.plan !== 'free';

  const gone = employer
    ? ['Your company account and name', 'All your job posts and their applicants', 'Saved workers and your hires list', paid && `Your ${user.plan === 'pro' ? 'Pro' : 'Premium'} plan, cancelled right away (no further charges)`]
    : ['Your profile, photo and resume', 'All your job applications', 'Your place in employers’ saved and hired lists'];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageBand title="Account settings" sub={`Signed in as ${user.email}`} />

      <section className={`${card} p-0`} aria-labelledby="your-account">
        <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 px-5 py-4">
          <Initials name={user.name} id={user.id} size="h-12 w-12 text-base" />
          <div className="min-w-0 flex-1">
            <h2 id="your-account" className="truncate font-display text-base font-bold">{user.name}</h2>
            <p className="truncate text-sm text-slate-500">{user.email}</p>
          </div>
          {!employer && <Link href="/profile" className={`${buttonGhost} px-4 py-2`}>Edit profile</Link>}
        </div>
        <ul className="divide-y divide-slate-100">
          <NameRow employer={employer} me={me} name={user.name} onSaved={(u) => signIn({ ...user, ...u })} />
          <Row icon="mail" label="Email" value={user.email}
            badge={me?.email_verified === false ? ['Not confirmed', 'bg-amber-100 text-amber-900'] : me ? ['Confirmed', 'bg-emerald-50 text-emerald-800'] : undefined}
            action={me?.email_verified === false ? <ResendLink /> : undefined} />
          <Row icon="key" label="Sign-in" value={me ? [me.has_google && 'Google', me.has_password && 'Email & password'].filter(Boolean).join(' · ') || '-' : '…'} />
          <Row icon="lock" label="Password" value={me?.has_password ? '••••••••' : me ? 'Not set (you sign in with Google)' : '…'}
            action={<Link href={`/forgot-password?email=${encodeURIComponent(user.email)}`} className="text-sm font-semibold text-emerald-700 hover:underline">{me && !me.has_password ? 'Set a password' : 'Change'}</Link>} />
          <Row icon="user" label="Account type" value={employer ? 'Employer' : 'Job seeker'} />
          {employer && <Row icon="card" label="Plan" value={<span className="capitalize">{user.plan ?? 'free'}</span>}
            action={<Link href="/pricing" className="text-sm font-semibold text-emerald-700 hover:underline">Plan &amp; billing</Link>} />}
        </ul>
      </section>

      {employer && <PhotoCard />}

      <section className={`${card} flex flex-wrap items-center gap-4 p-5`}>
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="font-display text-base font-bold">Deactivate my account</h2>
          <p className="text-sm text-slate-600">Taking a break? {employer ? 'Your jobs are hidden' : 'Your profile is hidden from employers'} and nobody can message you, but everything is kept. Log in anytime to come back.</p>
        </div>
        <button type="button" onClick={() => setPause(true)} className={`${buttonGhost} px-5 py-2.5`}>Deactivate</button>
      </section>
      {pause && <PauseDialog employer={employer} onClose={() => setPause(false)} onDone={() => { signOut(); router.replace('/?paused=1'); }} />}

      <section className={`${card} space-y-3 border-red-200 p-5`}>
        <h2 className="font-display text-base font-bold text-red-700">Delete my account</h2>
        <p className="text-sm text-slate-600">Permanently remove your account and everything in it. You&apos;ll see exactly what goes before anything is deleted.</p>
        <button type="button" onClick={() => setOpen(true)}
          className="inline-flex items-center justify-center rounded-full border border-red-300 px-5 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50">
          Delete my account
        </button>
      </section>
      {open && <DeleteDialog gone={gone.filter(Boolean) as string[]} paid={!!paid} onClose={() => setOpen(false)} onPause={() => { setOpen(false); setPause(true); }} onDeleted={() => { signOut(); router.replace('/?deleted=1'); }} />}
    </div>
  );
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Confirm, then show each step as it happens, then a clear "deleted" before signing out. The steps are paced
// (about a second each) so people can follow what's happening; the real work is one request in the background.
function DeleteDialog({ gone, paid, onClose, onPause, onDeleted }: { gone: string[]; paid: boolean; onClose: () => void; onPause: () => void; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState('');
  const [phase, setPhase] = useState<'confirm' | 'working' | 'done'>('confirm');
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [left, setLeft] = useState(4);
  const steps = [...(paid ? ['Cancelling your subscription'] : []), 'Removing your profile and files', 'Deleting your account'];

  async function run() {
    setError('');
    setPhase('working');
    setStep(0);
    const request = api('/me', { method: 'DELETE', body: { confirm }, quiet: true }).then(() => null, (err: Error) => err);
    for (let i = 0; i < steps.length; i++) { setStep(i); await wait(900); }
    const failed = await request;
    if (failed) { setError(failed.message); setPhase('confirm'); return; }
    setStep(steps.length);
    await wait(500);
    setPhase('done');
  }

  // After "deleted": count down, then sign out and go home.
  useEffect(() => {
    if (phase !== 'done') return;
    if (left === 0) { onDeleted(); return; }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, left, onDeleted]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="del-title">
      <div className={`${card} w-full max-w-md space-y-4`}>
        {phase === 'confirm' && (
          <>
            <h2 id="del-title" className="font-display text-xl font-bold text-red-700">Delete your account?</h2>
            <div className="space-y-1.5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-950">
              <p className="font-semibold">This can&apos;t be undone. We&apos;ll remove:</p>
              <ul className="list-disc space-y-0.5 pl-5">{gone.map((g) => <li key={g}>{g}</li>)}</ul>
            </div>
            <p className="text-sm text-slate-600">People you messaged keep their side of the chat, from &ldquo;Deleted user&rdquo;. You can sign up again later with the same email.</p>
            <label htmlFor="confirm-delete" className="block space-y-2 text-sm">
              <span className="flex flex-wrap items-center gap-1.5 text-slate-700">
                To confirm, type
                <code className="rounded-md bg-red-100 px-2 py-0.5 font-mono text-[13px] font-bold tracking-widest text-red-700">DELETE</code>
                below
              </span>
              <span className="relative block">
                <input id="confirm-delete" autoFocus autoComplete="off" spellCheck={false} placeholder="DELETE" value={confirm} onChange={(e) => setConfirm(e.target.value.toUpperCase())}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-center font-mono text-base font-bold uppercase tracking-[0.3em] text-red-700 placeholder:font-normal placeholder:text-slate-300 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20" />
                {confirm === 'DELETE' && <span className="absolute right-3 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full bg-red-600 text-[11px] text-white" aria-hidden="true">✓</span>}
              </span>
            </label>
            <ErrorText msg={error} />
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={onPause} className="mr-auto text-sm font-semibold text-emerald-700 hover:underline">Just want a break? Deactivate instead</button>
              <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button type="button" onClick={run} disabled={confirm !== 'DELETE'}
                className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40">Delete forever</button>
            </div>
          </>
        )}
        {phase === 'working' && (
          <>
            <h2 id="del-title" className="font-display text-xl font-bold">Deleting your account…</h2>
            <ul className="space-y-2 text-sm" aria-live="polite">
              {steps.map((label, i) => (
                <li key={label} className={`flex items-center gap-3 ${i > step ? 'text-slate-400' : 'text-slate-800'}`}>
                  {i < step ? <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-600 text-[11px] text-white">✓</span>
                    : i === step ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" aria-hidden="true" />
                    : <span className="h-5 w-5 rounded-full border-2 border-slate-200" aria-hidden="true" />}
                  {label}
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500">Please keep this page open.</p>
          </>
        )}
        {phase === 'done' && (
          <div className="space-y-3 text-center" aria-live="polite">
            <p className="text-4xl" aria-hidden="true">✅</p>
            <h2 id="del-title" className="font-display text-xl font-bold">Your account has been deleted</h2>
            <p className="text-sm text-slate-600">Thanks for being part of ReadyToWork.ph.</p>
            <p className="flex items-center justify-center gap-2 text-sm text-slate-500">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" aria-hidden="true" />
              Logging you out in {left}…
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const ICONS: Record<string, string> = {
  mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
  key: 'M15 7a3 3 0 1 1-2.8 4H4v3h3v-2h2v2h3.2A3 3 0 0 1 15 7Z',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  card: 'M3 6h18v12H3zM3 10h18',
};

// Your name, edited in place: first and last name for workers, one "company or your name" for employers.
function NameRow({ employer, me, name, onSaved }: { employer: boolean; me?: User | null; name: string; onSaved: (u: User) => void }) {
  const [form, setForm] = useState<{ name: string; first_name: string; last_name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const link = 'text-sm font-semibold text-emerald-700 hover:underline';
  if (!form) {
    return <Row icon="user" label={employer ? 'Company or your name' : 'Name'} value={name}
      action={<button type="button" className={link} onClick={() => { setError(''); setForm({ name, first_name: me?.first_name ?? '', last_name: me?.last_name ?? '' }); }}>Edit</button>} />;
  }
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      onSaved(await api<User>('/me', { method: 'PUT', body: employer ? { name: form!.name } : { first_name: form!.first_name, last_name: form!.last_name } }));
      setForm(null);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return (
    <li className="px-5 py-4">
      <form onSubmit={save} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {employer
            ? <label className="space-y-1 text-sm font-medium text-slate-700 sm:col-span-2">Company or your name
                <input className={input} required maxLength={100} autoComplete="organization" value={form.name} onChange={set('name')} autoFocus /></label>
            : <>
                <label className="space-y-1 text-sm font-medium text-slate-700">First name
                  <input className={input} required maxLength={50} autoComplete="given-name" value={form.first_name} onChange={set('first_name')} autoFocus /></label>
                <label className="space-y-1 text-sm font-medium text-slate-700">Last name
                  <input className={input} required maxLength={50} autoComplete="family-name" value={form.last_name} onChange={set('last_name')} /></label>
              </>}
        </div>
        <ErrorText msg={error} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setForm(null)} className={`${buttonGhost} px-4 py-2`}>Cancel</button>
          <button type="submit" disabled={busy} className={`${button} px-4 py-2 disabled:opacity-60`}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </li>
  );
}

// One settings row: icon, label, value (with an optional badge), and an action on the right.
function Row({ icon, label, value, badge, action }: { icon: string; label: string; value: React.ReactNode; badge?: [string, string]; action?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[icon]} /></svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
          <span className="min-w-0 truncate">{value}</span>
          {badge && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge[1]}`}>{badge[0]}</span>}
        </p>
      </div>
      {action}
    </li>
  );
}

function ResendLink() {
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  if (state === 'sent') return <span className="text-sm font-semibold text-emerald-700">Link sent ✓</span>;
  return (
    <button type="button" disabled={state === 'busy'} onClick={async () => { setState('busy'); try { await api('/auth/verify/resend', { method: 'POST', quiet: true }); setState('sent'); } catch { setState('idle'); } }}
      className="text-sm font-semibold text-emerald-700 hover:underline disabled:opacity-50">{state === 'busy' ? 'Sending…' : 'Send link'}</button>
  );
}

// Pause the account: confirm, a short "pausing" step, then "paused" and sign out.
function PauseDialog({ employer, onClose, onDone }: { employer: boolean; onClose: () => void; onDone: () => void }) {
  const [phase, setPhase] = useState<'confirm' | 'working' | 'done'>('confirm');
  const [error, setError] = useState('');
  const [left, setLeft] = useState(4);
  async function run() {
    setError('');
    setPhase('working');
    const [result] = await Promise.all([api('/me/deactivate', { method: 'POST', quiet: true }).then(() => null, (err: Error) => err), wait(1200)]);
    if (result) { setError(result.message); setPhase('confirm'); return; }
    setPhase('done');
  }
  useEffect(() => {
    if (phase !== 'done') return;
    if (left === 0) { onDone(); return; }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, left, onDone]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <div className={`${card} w-full max-w-md space-y-4`}>
        {phase === 'confirm' && (
          <>
            <h2 id="pause-title" className="font-display text-xl font-bold">Deactivate your account?</h2>
            <ul className="space-y-1.5 text-sm text-slate-700">
              <li>🙈 {employer ? 'Your job posts are hidden and stop taking applications' : 'Your profile is hidden from employers’ searches'}</li>
              <li>✉️ Nobody can send you new messages</li>
              <li>💾 Everything is kept: {employer ? 'jobs, applicants' : 'profile, applications'} and chats</li>
              <li>🔑 To come back, just log in again</li>
            </ul>
            <ErrorText msg={error} />
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button type="button" onClick={run} className="rounded-full bg-emerald-950 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-900">Deactivate</button>
            </div>
          </>
        )}
        {phase === 'working' && (
          <p className="flex items-center gap-3 py-4 text-slate-700" aria-live="polite">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" aria-hidden="true" />
            Pausing your account…
          </p>
        )}
        {phase === 'done' && (
          <div className="space-y-3 text-center" aria-live="polite">
            <p className="text-4xl" aria-hidden="true">⏸️</p>
            <h2 id="pause-title" className="font-display text-xl font-bold">Your account is paused</h2>
            <p className="text-sm text-slate-600">Log in anytime to pick up where you left off.</p>
            <p className="flex items-center justify-center gap-2 text-sm text-slate-500">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" aria-hidden="true" />
              Logging you out in {left}…
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
