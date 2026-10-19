'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ErrorText, PageBand, card, input } from '@/components/ui';

// Account settings: the email you sign in with, and deleting the account (Data Privacy Act: right to erasure).
export default function AccountPage() {
  const { user, ready, signOut } = useAuth();
  const router = useRouter();
  const [confirm, setConfirm] = useState('');
  const [state, setState] = useState<{ busy?: boolean; error?: string }>({});

  if (ready && !user) return <p><Link href="/login?next=/account" className="text-emerald-700 underline">Log in</Link> to see your account settings.</p>;
  if (!user) return <p className="text-slate-500">Loading…</p>;
  const employer = user.role === 'employer';
  const paid = employer && user.plan && user.plan !== 'free';

  async function remove(e: React.FormEvent) {
    e.preventDefault();
    setState({ busy: true });
    try {
      await api('/me', { method: 'DELETE', body: { confirm } });
      signOut();
      router.replace('/?deleted=1');
    } catch (err) {
      setState({ error: (err as Error).message });
    }
  }

  const gone = employer
    ? ['Your company account and name', 'All your job posts and their applicants', 'Saved workers and your hires list', paid && `Your ${user.plan === 'pro' ? 'Pro' : 'Premium'} plan, cancelled right away (no further charges)`]
    : ['Your profile, photo and resume', 'All your job applications', 'Your place in employers’ saved and hired lists'];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageBand title="Account settings" sub={`Signed in as ${user.email}`} />

      <section className={`${card} space-y-2 p-5`}>
        <h2 className="font-display text-base font-bold">Your account</h2>
        <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-y-1 text-sm">
          <dt className="text-slate-500">Email</dt><dd className="font-medium">{user.email}</dd>
          <dt className="text-slate-500">Account type</dt><dd className="font-medium">{employer ? 'Employer' : 'Job seeker'}</dd>
          {employer && <><dt className="text-slate-500">Plan</dt><dd className="font-medium capitalize">{user.plan ?? 'free'} · <Link href="/pricing" className="text-emerald-700 hover:underline">Plan &amp; billing</Link></dd></>}
        </dl>
        <p className="text-xs text-slate-500">Forgot your password? <Link href={`/forgot-password?email=${encodeURIComponent(user.email)}`} className="text-emerald-700 hover:underline">Reset it here</Link>.</p>
      </section>

      <form onSubmit={remove} className={`${card} space-y-3 border-red-200 p-5`}>
        <h2 className="font-display text-base font-bold text-red-700">Delete my account</h2>
        <p className="text-sm text-slate-600">This can&apos;t be undone. Deleting removes, right away:</p>
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-700">{gone.filter(Boolean).map((g) => <li key={String(g)}>{g}</li>)}</ul>
        <p className="text-sm text-slate-600">People you messaged keep their side of the conversation, shown from &ldquo;Deleted user&rdquo;. You can sign up again later with the same email, as a new account.</p>
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-slate-700">Type <b>DELETE</b> to confirm</span>
          <input id="confirm-delete" className={`${input} py-2`} autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <ErrorText msg={state.error ?? ''} />
        <button disabled={confirm !== 'DELETE' || state.busy}
          className="inline-flex items-center justify-center rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-40">
          {state.busy ? 'Deleting…' : 'Delete my account forever'}
        </button>
      </form>
    </div>
  );
}
