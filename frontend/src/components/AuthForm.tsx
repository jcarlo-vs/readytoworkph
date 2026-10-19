'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError, type User } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Field, ErrorText, FormAlert, Logo, input, button } from '@/components/ui';
import { PasswordInput } from '@/components/PasswordInput';
import { GoogleButton } from '@/components/GoogleButton';
import { Turnstile, robotCheckOn } from '@/components/Turnstile';

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

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
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
  // The robot check: always on sign-up; on login only after 2 wrong tries (the server says when).
  const [robotToken, setRobotToken] = useState('');
  const [robotKey, setRobotKey] = useState(0); // a token works once: remount for a fresh one after each try
  const [needCheck, setNeedCheck] = useState(false);
  // Google sign-up with an account that already exists under the other role: offer to log into that one.
  const [existing, setExisting] = useState<{ credential: string; role: string } | null>(null);
  // Why a log-in failed (wrong password, no account, Google-only, too many tries), to show the right next step.
  const [failure, setFailure] = useState<{ code: string; attemptsLeft?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const register = mode === 'register';

  async function authenticate(path: string, body: object) {
    setBusy(true);
    setError('');
    setExisting(null);
    setFailure(null);
    try {
      const { user } = await api<{ user: User }>(path, { body });
      signIn(user);
      router.push(next && !(next === '/jobs/new' && user.role !== 'employer') ? next : register && user.role === 'worker' ? '/profile' : '/dashboard');
    } catch (err) {
      if (!register && err instanceof ApiError && (err.status === 429 || typeof err.data?.code === 'string'))
        setFailure({ code: err.status === 429 ? 'locked' : String(err.data?.code), attemptsLeft: Number(err.data?.attemptsLeft) || undefined });
      if (err instanceof ApiError && (err.data?.robotCheck === true || err.data?.code === 'robot_check')) setNeedCheck(true);
      setRobotToken(''); setRobotKey((k) => k + 1);
      if (err instanceof ApiError && err.status === 409 && typeof err.data?.existingRole === 'string' && 'credential' in body)
        setExisting({ credential: String(body.credential), role: err.data.existingRole });
      // Logging in with a Google account that has no ReadyToWork.ph account yet: send them to sign up.
      setError(!register && err instanceof ApiError && err.status === 404 && path === '/auth/google'
        ? 'There’s no ReadyToWork.ph account for this Google account yet. Click “Create an account” above to sign up.'
        : (err as Error).message);
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    authenticate(`/auth/${mode}`, robotToken ? { ...form, turnstile: robotToken } : form);
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
              : <>Welcome back to <span className="text-amber-300">ReadyToWork.ph.</span></>}
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
              : <>New to ReadyToWork.ph? <Link href={`/register${carry}`} className="font-medium text-emerald-700 hover:underline">Create an account</Link></>}
          </p>
        </div>

        {register && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">How will you use ReadyToWork.ph?</legend>
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
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <label htmlFor="password" className="text-sm font-medium text-slate-700">Password</label>
            {!register && (
              <Link href={`/forgot-password${form.email ? `?email=${encodeURIComponent(form.email)}` : ''}`} className="text-sm font-medium text-emerald-700 hover:underline">
                Forgot password?
              </Link>
            )}
          </div>
          <PasswordInput id="password" required minLength={register ? 8 : undefined}
            autoComplete={register ? 'new-password' : 'current-password'} value={form.password} onChange={set('password')} />
          {register && <span className="text-xs text-slate-500">At least 8 characters.</span>}
        </div>
        {failure ? <LoginProblem failure={failure} message={error} email={form.email} carry={carry} />
          : !existing && <ErrorText msg={error} />}
        {(register || needCheck) && <Turnstile key={robotKey} onToken={setRobotToken} />}
        <button className={`${button} w-full py-3`} disabled={busy || (robotCheckOn && (register || needCheck) && !robotToken)}>
          {busy ? 'Please wait…' : register ? (form.role === 'employer' ? 'Create employer account' : 'Create my profile') : 'Log in'}
        </button>
        {CLIENT_ID && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />or<span className="h-px flex-1 bg-slate-200" />
            </div>
            {/* Google's own button can't say which kind of account it creates, so this label does. */}
            <p className="flex items-center justify-center gap-2 text-sm text-slate-600">
              {register ? (
                <>
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-emerald-700" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={ROLES.find((r) => r.value === form.role)!.icon} />
                  </svg>
                  <span>Sign up with Google as <strong className="text-emerald-700">{form.role === 'employer' ? 'an employer' : 'a job seeker'}</strong></span>
                </>
              ) : 'Log in with Google'}
            </p>
            <GoogleButton signup={register} onCredential={google} />
            {existing && (
              <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
                <p>{error}</p>
                <button type="button" onClick={() => authenticate('/auth/google', { credential: existing.credential })}
                  className="font-semibold text-emerald-800 underline-offset-2 hover:underline">
                  Log in as {existing.role === 'worker' ? 'job seeker' : 'employer'} instead
                </button>
              </div>
            )}
          </div>
        )}
        {register && (
          <p className="text-center text-xs text-slate-500">
            By creating an account, you agree to our{' '}
            <Link href="/terms" className="font-medium text-emerald-700 hover:underline">Terms of Service</Link> and{' '}
            <Link href="/privacy" className="font-medium text-emerald-700 hover:underline">Privacy Policy</Link>.
          </p>
        )}
      </form>
    </div>
  );
}

// What went wrong at log-in, and the one thing to do about it.
function LoginProblem({ failure, message, email, carry }: { failure: { code: string; attemptsLeft?: number }; message: string; email: string; carry: string }) {
  const reset = `/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`;
  if (failure.code === 'wrong_password') return (
    <FormAlert tone="error" title="Incorrect password">
      <p>Check for typos and that Caps Lock is off.{failure.attemptsLeft != null && failure.attemptsLeft <= 5 && ` ${failure.attemptsLeft} ${failure.attemptsLeft === 1 ? 'try' : 'tries'} left before a 15-minute pause.`}</p>
      <p>Forgot it? <Link href={reset}>Reset your password</Link></p>
    </FormAlert>
  );
  if (failure.code === 'no_account') return (
    <FormAlert tone="error" title="No account uses this email">
      <p>Check the spelling, or <Link href={`/register${carry}`}>create a free account</Link>.</p>
    </FormAlert>
  );
  if (failure.code === 'robot_check') return (
    <FormAlert tone="error" title="Please confirm you're human">
      <p>Complete the quick security check below, then log in again.</p>
    </FormAlert>
  );
  if (failure.code === 'locked') return (
    <FormAlert tone="error" title="Too many tries">
      <p>For your security, logging in with a password is paused for 15 minutes. You can <Link href={reset}>reset your password</Link> now, which also ends the pause, or use Google sign-in if your account has it.</p>
    </FormAlert>
  );
  return <FormAlert tone="error" title={message} />;
}
