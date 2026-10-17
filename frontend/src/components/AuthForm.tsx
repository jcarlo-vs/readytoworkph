'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { api, type User } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Field, ErrorText, Logo, input, button } from '@/components/ui';
import { GoogleButton } from '@/components/GoogleButton';

const ROLES = [
  {
    value: 'worker',
    title: 'I’m looking for work',
    text: 'Create a profile and apply to remote jobs.',
    icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  },
  {
    value: 'employer',
    title: 'I’m hiring',
    text: 'Post jobs and find Filipino talent.',
    icon: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16',
  },
] as const;

const PERKS = ['Free to sign up', 'Thousands of skills to search', 'Hire directly, no middleman'];

function RoleCard({ role, checked, onChange }: { role: (typeof ROLES)[number]; checked: boolean; onChange: () => void }) {
  return (
    <label className={`relative flex cursor-pointer flex-col gap-3 rounded-xl border-2 p-4 transition
      has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-600/40
      ${checked ? 'border-emerald-600 bg-emerald-50/60' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
      <input type="radio" name="role" value={role.value} checked={checked} onChange={onChange} className="sr-only" />
      <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${checked ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'}`}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={role.icon} />
        </svg>
      </span>
      <span>
        <span className="block text-sm font-semibold text-slate-900">{role.title}</span>
        <span className="mt-0.5 block text-xs text-slate-500">{role.text}</span>
      </span>
      <span aria-hidden className={`absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border-2 transition
        ${checked ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300 bg-white'}`}>
        {checked && (
          <svg viewBox="0 0 12 12" className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 6.5l2.5 2.5 4.5-5" />
          </svg>
        )}
      </span>
    </label>
  );
}

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const { signIn } = useAuth();
  const router = useRouter();
  // ?role=employer preselects the role card; ?next=/jobs/new returns there after signing in (same-site paths only).
  const params = useSearchParams();
  const next = params.get('next')?.match(/^\/(?!\/)/) ? params.get('next') : null;
  const carry = params.toString() ? `?${params}` : '';
  const [form, setForm] = useState({ name: '', email: '', password: '', role: params.get('role') === 'employer' ? 'employer' : 'worker' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const register = mode === 'register';

  async function authenticate(path: string, body: object) {
    setBusy(true);
    setError('');
    try {
      const { token, user } = await api<{ token: string; user: User }>(path, { body });
      signIn(token, user);
      router.push(next && !(next === '/jobs/new' && user.role !== 'employer') ? next : register && user.role === 'worker' ? '/profile' : '/dashboard');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    authenticate(`/auth/${mode}`, form);
  }

  // On sign-up the chosen role card decides the new account's role; on login it's ignored.
  const google = (credential: string) => authenticate('/auth/google', register ? { credential, role: form.role } : { credential });
  return (
    <div className="mx-auto grid max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[1fr_1.15fr]">
      <aside className="relative hidden overflow-hidden bg-emerald-950 p-10 text-white lg:flex lg:flex-col">
        <div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-amber-300/20 blur-3xl" />
        <Logo light />
        <div className="relative mt-auto space-y-6">
          <h2 className="text-3xl font-bold leading-tight">
            {register ? <>Your next great hire, or your next great job, <span className="text-amber-300">starts here.</span></>
              : <>Welcome back to <span className="text-amber-300">RemotePinas.</span></>}
          </h2>
          <ul className="space-y-3 text-sm text-emerald-50/90">
            {PERKS.map((p) => (
              <li key={p} className="flex items-center gap-3">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-slate-900">✓</span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <form onSubmit={submit} className="space-y-5 p-8 sm:p-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{register ? 'Create your account' : 'Log in to your account'}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {register ? <>Already have an account? <Link href={`/login${carry}`} className="font-medium text-emerald-700 hover:underline">Log in</Link></>
              : <>New to RemotePinas? <Link href={`/register${carry}`} className="font-medium text-emerald-700 hover:underline">Create an account</Link></>}
          </p>
        </div>

        {register && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">How will you use RemotePinas?</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {ROLES.map((r) => (
                <RoleCard key={r.value} role={r} checked={form.role === r.value} onChange={() => setForm({ ...form, role: r.value })} />
              ))}
            </div>
          </fieldset>
        )}

        {register && (
          <Field label={form.role === 'employer' ? 'Company or your name' : 'Full name'}>
            <input className={input} required autoComplete="name" value={form.name} onChange={set('name')} />
          </Field>
        )}
        <Field label="Email"><input className={input} type="email" required autoComplete="email" value={form.email} onChange={set('email')} /></Field>
        <Field label="Password">
          <input className={input} type="password" required minLength={register ? 8 : undefined}
            autoComplete={register ? 'new-password' : 'current-password'} value={form.password} onChange={set('password')} />
          {register && <span className="text-xs text-slate-500">At least 8 characters.</span>}
        </Field>
        <ErrorText msg={error} />
        <button className={`${button} w-full py-3`} disabled={busy}>
          {busy ? 'Please wait…' : register ? (form.role === 'employer' ? 'Create employer account' : 'Create my profile') : 'Log in'}
        </button>
        <GoogleButton text={register ? 'signup_with' : 'signin_with'} onCredential={google} />
      </form>
    </div>
  );
}
