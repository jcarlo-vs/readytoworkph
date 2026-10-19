'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { ErrorText, Field, FormAlert, button, card, input } from '@/components/ui';
import { Turnstile, robotCheckOn } from '@/components/Turnstile';

// Step 1 of resetting a password: ask for the email and send a one-time link.
export default function ForgotPasswordPage() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [status, setStatus] = useState<{ busy: boolean; error: string; sentTo: string }>({ busy: false, error: '', sentTo: '' });
  const [robotToken, setRobotToken] = useState('');
  const [robotKey, setRobotKey] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ busy: true, error: '', sentTo: '' });
    try {
      await api('/auth/forgot', { body: { email, turnstile: robotToken } });
      setStatus({ busy: false, error: '', sentTo: email });
    } catch (err) {
      setStatus({ busy: false, error: (err as Error).message, sentTo: '' });
    } finally {
      setRobotToken(''); setRobotKey((k) => k + 1); // a token works once
    }
  }

  return (
    <div className={`${card} mx-auto max-w-md space-y-5 p-8`}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reset your password</h1>
        <p className="mt-1 text-sm text-slate-500">Enter the email you signed up with and we&apos;ll send you a link to choose a new password.</p>
      </div>
      {status.sentTo ? (
        <>
          <FormAlert tone="success" title="Check your email">
            <p>If an account uses <strong>{status.sentTo}</strong>, a reset link is on its way. It works once and expires in 1 hour.</p>
            <p>Nothing after a few minutes? Check your Spam folder, or <button type="button" className="font-semibold underline underline-offset-2" onClick={() => setStatus({ busy: false, error: '', sentTo: '' })}>try again</button>.</p>
          </FormAlert>
          <Link href="/login" className="block text-center text-sm font-medium text-emerald-700 hover:underline">Back to log in</Link>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email"><input className={input} type="email" required autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Turnstile key={robotKey} onToken={setRobotToken} />
          <ErrorText msg={status.error} />
          <button className={`${button} w-full py-3`} disabled={status.busy || (robotCheckOn && !robotToken)}>{status.busy ? 'Sending…' : 'Send reset link'}</button>
          <p className="text-center text-sm text-slate-500">Remembered it? <Link href="/login" className="font-medium text-emerald-700 hover:underline">Log in</Link></p>
        </form>
      )}
    </div>
  );
}
