'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, type User } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { button, card } from '@/components/ui';

// The link from the "Confirm your email" message lands here. It confirms the address straight away;
// if the person is signed in on this device, the yellow reminder disappears too.
export default function VerifyEmailPage() {
  const token = useSearchParams().get('token') ?? '';
  const { user, signIn } = useAuth();
  const [state, setState] = useState<'checking' | 'done' | 'expired'>(token ? 'checking' : 'expired');
  const sent = useRef(false); // the link works once, so only ever send it once

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    api('/auth/verify', { body: { token }, quiet: true })
      .then(async () => {
        setState('done');
        try { signIn(await api<User>('/me', { quiet: true })); } catch { /* not signed in on this device */ }
      })
      .catch(() => setState('expired'));
  }, [token, signIn]);

  const next = user?.role === 'employer' ? ['/jobs/new', 'Post a job'] : user ? ['/dashboard', 'Go to my dashboard'] : ['/login', 'Log in'];
  return (
    <div className={`${card} mx-auto max-w-md space-y-4 p-10 text-center`}>
      {state === 'checking' && <p className="text-slate-600">Confirming your email…</p>}
      {state === 'done' && (
        <>
          <p className="text-4xl" aria-hidden="true">✅</p>
          <h1 className="font-display text-2xl font-bold text-slate-900">Email confirmed</h1>
          <p className="text-slate-600">Thanks! Your account is all set.</p>
          <Link href={next[0]} className={button}>{next[1]}</Link>
        </>
      )}
      {state === 'expired' && (
        <>
          <h1 className="font-display text-2xl font-bold text-slate-900">This link has expired</h1>
          <p className="text-slate-600">Confirmation links work once and for 3 days. {user ? 'Use “Send a new link” in the yellow bar at the top.' : 'Log in and ask for a new one from the yellow bar at the top.'}</p>
          {!user && <Link href="/login" className={button}>Log in</Link>}
        </>
      )}
    </div>
  );
}
