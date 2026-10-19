'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError, type User } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ErrorText, FormAlert, button, card } from '@/components/ui';
import { PasswordInput } from '@/components/PasswordInput';

// Step 2 of resetting a password: the link from the email lands here. Success signs the person in.
export default function ResetPasswordPage() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const { signIn } = useAuth();
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [status, setStatus] = useState({ busy: false, error: '', expired: !token });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) return setStatus({ ...status, error: 'The two passwords don’t match.' });
    setStatus({ busy: true, error: '', expired: false });
    try {
      const { user } = await api<{ user: User }>('/auth/reset', { body: { token, password: form.password } });
      signIn(user);
      router.push(user.role === 'worker' ? '/jobs' : '/dashboard');
    } catch (err) {
      const expired = err instanceof ApiError && err.data?.code === 'invalid_link';
      setStatus({ busy: false, error: expired ? '' : (err as Error).message, expired });
    }
  }

  return (
    <div className={`${card} mx-auto max-w-md space-y-5 p-8`}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Choose a new password</h1>
        <p className="mt-1 text-sm text-slate-500">Use at least 8 characters. You&apos;ll be logged in right after.</p>
      </div>
      {status.expired ? (
        <FormAlert tone="error" title="This link has expired or was already used">
          <p>Reset links work once and last 1 hour. <Link href="/forgot-password">Get a new link</Link></p>
        </FormAlert>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">New password</span>
            <PasswordInput required minLength={8} autoComplete="new-password" autoFocus value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Confirm new password</span>
            <PasswordInput required minLength={8} autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
          </label>
          <ErrorText msg={status.error} />
          <button className={`${button} w-full py-3`} disabled={status.busy}>{status.busy ? 'Saving…' : 'Save and log in'}</button>
        </form>
      )}
    </div>
  );
}
