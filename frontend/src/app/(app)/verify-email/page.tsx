'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError, type User } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CodeInput, button, card, input } from '@/components/ui';

// After an email sign-up: type the 6-digit code we emailed. Everything else waits until then (lib/auth.tsx).
export default function VerifyEmailPage() {
  const { user, ready, signIn, signOut } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  // Where they were headed (same-site paths only). Sign-up and log-in pages just lead to the usual start page.
  const next = params.get('next')?.match(/^\/(?!\/|verify-email|register|login)/) ? params.get('next')! : null;
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(60); // the server allows a new code once a minute
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState('');

  const go = (u: User) => router.replace(next ?? (u.role === 'worker' ? '/profile' : '/dashboard'));
  useEffect(() => { if (user?.email_verified) go(user); }); // already confirmed: move on
  // No live code (an account from before codes, or back after 10 minutes)? Send one now; otherwise keep theirs.
  const unconfirmedId = user?.email_verified === false ? user.id : null;
  useEffect(() => {
    if (!unconfirmedId) return;
    api<{ sent?: boolean }>('/auth/verify/resend', { body: { if_none: true }, quiet: true })
      .then((r) => { if (r.sent) setWait(60); })
      .catch(() => { /* the button below can still send one */ });
  }, [unconfirmedId]);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function submit(value: string) {
    setBusy(true);
    setError('');
    try {
      const { user: u } = await api<{ user: User }>('/auth/verify', { body: { code: value } });
      signIn(u);
      try { sessionStorage.setItem('flash', 'Email confirmed. Welcome to ReadyToWork.ph!'); } catch { /* storage off */ }
      go(u);
    } catch (err) {
      setError((err as Error).message);
      setCode('');
      setBusy(false);
    }
  }

  async function resend() {
    setError('');
    setNotice('');
    try {
      await api('/auth/verify/resend', { method: 'POST' });
      setNotice('New code sent. Check your inbox (and Spam).');
      setWait(60);
    } catch (err) {
      setError((err as Error).message);
      const w = err instanceof ApiError ? Number(err.data?.wait) : 0;
      if (w) setWait(w);
    }
  }

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const { user: u } = await api<{ user: User }>('/auth/email', { method: 'PUT', body: { email } });
      signIn(u);
      setEditing(false);
      setNotice(`We sent a new code to ${u.email}.`);
      setWait(60);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!ready) return null;
  if (!user) {
    return (
      <div className={`${card} mx-auto max-w-md space-y-4 p-10 text-center`}>
        <h1 className="font-display text-2xl font-bold text-slate-900">Confirm your email</h1>
        <p className="text-slate-600">Log in, then enter the 6-digit code we email you.</p>
        <Link href="/login?next=/verify-email" className={button}>Log in</Link>
      </div>
    );
  }

  return (
    <div className={`${card} mx-auto max-w-md space-y-5 p-8 text-center sm:p-10`}>
      <p className="text-4xl" aria-hidden="true">📩</p>
      <h1 className="font-display text-2xl font-bold text-slate-900">Check your email</h1>
      <p className="text-slate-600">We sent a 6-digit code to <b className="break-all text-slate-900">{user.email}</b>. It works for 10 minutes. Can&apos;t find it? Check Spam.</p>

      <form onSubmit={(e) => { e.preventDefault(); if (code.length === 6) submit(code); }} className="space-y-3">
        <CodeInput value={code} onChange={setCode} onComplete={submit} disabled={busy} />
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {notice && !error && <p className="text-sm text-emerald-800">{notice}</p>}
        <button type="submit" disabled={busy || code.length !== 6} className={`${button} w-full py-3`}>{busy ? 'Checking…' : 'Confirm my email'}</button>
      </form>

      <div className="space-y-2 text-sm text-slate-600">
        <p>
          Didn&apos;t get it?{' '}
          {wait > 0 ? <span className="text-slate-500">Send a new code in {wait}s</span>
            : <button type="button" onClick={resend} className="font-semibold text-emerald-700 hover:underline">Send a new code</button>}
        </p>
        {editing ? (
          <form onSubmit={changeEmail} className="flex gap-2 pt-1">
            <label htmlFor="new-email" className="sr-only">Your email</label>
            <input id="new-email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={input} />
            <button type="submit" className={`${button} px-4`}>Save</button>
          </form>
        ) : (
          <p>Wrong email? <button type="button" onClick={() => { setEmail(user.email); setEditing(true); }} className="font-semibold text-emerald-700 hover:underline">Change it</button></p>
        )}
        <p><button type="button" onClick={() => { signOut(); router.push('/'); }} className="text-slate-500 hover:underline">Log out</button></p>
      </div>
    </div>
  );
}
