'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ErrorText, Field, Logo, button, card, input } from '@/components/ui';
import { AdminContext, adminApi } from './ui';

// The admin is its own small app: a dark menu grouped by topic, its own login, and no public site menu.
const ICON: Record<string, string> = {
  overview: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  jobs: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16',
  visitors: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  subscriptions: 'M3 6h18v12H3zM3 10h18M7 15h3',
  feedback: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z',
  settings: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6',
  site: 'M7 17 17 7M8 7h9v9',
  out: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
};
const MENU: [string, [string, string, string][]][] = [
  ['Insights', [['overview', 'Overview', '/admin']]],
  ['People', [['users', 'Users', '/admin/users'], ['jobs', 'Jobs', '/admin/jobs'], ['visitors', 'Visitors', '/admin/visitors']]],
  ['Money', [['subscriptions', 'Subscriptions', '/admin/subscriptions']]],
  ['Support', [['feedback', 'Feedback & support', '/admin/feedback']]],
  ['System', [['settings', 'Settings', '/admin/settings']]],
];
const Icon = ({ name }: { name: string }) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON[name]} /></svg>
);

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [state, setState] = useState<'checking' | 'login' | 'in'>('checking');
  const [openFeedback, setOpenFeedback] = useState(0);

  const logout = useCallback(() => { adminApi('/logout', 'POST').catch(() => {}); setState('login'); }, []);
  const refreshCounts = useCallback(() => {
    adminApi<{ totals: { open_feedback: number } }>('/stats').then((s) => setOpenFeedback(s.totals.open_feedback), () => {});
  }, []);
  useEffect(() => { adminApi('/settings').then(() => setState('in'), () => setState('login')); }, []);
  useEffect(() => {
    if (state !== 'in') return;
    refreshCounts();
    const t = setInterval(refreshCounts, 60_000);
    return () => clearInterval(t);
  }, [state, refreshCounts]);

  if (state === 'checking') return <p className="p-10 text-slate-500">Loading…</p>;
  if (state === 'login') return <AdminLogin onDone={() => setState('in')} />;

  const current = MENU.flatMap(([group, items]) => items.map((i) => [group, ...i] as const))
    .find(([, , , href]) => (href === '/admin' ? path === '/admin' : path.startsWith(href)));
  return (
    <AdminContext.Provider value={{ logout, refreshCounts }}>
      <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="bg-[#0b1f19] text-emerald-100 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
          {/* the logo links to the public site, like everywhere else */}
          <div className="flex items-center gap-2 whitespace-nowrap px-5 py-4 lg:flex-col lg:items-start lg:gap-1.5 [&_a]:text-[1.2rem]!">
            <Logo light />
            <span className="rounded-md bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-900">Admin panel</span>
          </div>
          <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:flex-1 lg:space-y-0.5 lg:overflow-visible">
            {MENU.map(([group, items]) => (
              <div key={group} className="contents lg:block">
                <p className="hidden px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200/50 lg:block">{group}</p>
                {items.map(([key, label, href]) => {
                  const on = current?.[1] === key;
                  return (
                    <Link key={key} href={href} aria-current={on ? 'page' : undefined}
                      className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${on ? 'bg-emerald-400/15 text-white' : 'text-emerald-100/80 hover:bg-white/5 hover:text-white'}`}>
                      <Icon name={key} />{label}
                      {key === 'feedback' && openFeedback > 0 && (
                        <span className="ml-auto rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-slate-900" aria-label={`${openFeedback} open`}>{openFeedback}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="hidden space-y-0.5 border-t border-white/10 p-3 lg:block">
            <Link href="/" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-emerald-100/80 hover:bg-white/5 hover:text-white"><Icon name="site" />View site</Link>
            <button type="button" onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-emerald-100/80 hover:bg-white/5 hover:text-white"><Icon name="out" />Log out</button>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-3 text-sm">
            <span className="text-slate-500">{current?.[0]}</span>
            <span className="text-slate-300" aria-hidden="true">›</span>
            <span className="font-semibold text-slate-900">{current?.[2]}</span>
            <span className="flex-1" />
            <Link href="/" className="font-medium text-slate-500 hover:text-slate-900 lg:hidden">View site ↗</Link>
            <button type="button" onClick={logout} className="font-medium text-slate-500 hover:text-slate-900 lg:hidden">Log out</button>
          </header>
          <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">{children}</main>
        </div>
      </div>
    </AdminContext.Provider>
  );
}

function AdminLogin({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [status, setStatus] = useState({ busy: false, error: '' });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ busy: true, error: '' });
    try {
      await adminApi('/login', 'POST', form);
      onDone();
    } catch (err) {
      setStatus({ busy: false, error: (err as Error).message });
    }
  }
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#0b1f19] px-4">
      <form onSubmit={submit} className={`${card} w-full max-w-sm space-y-4`}>
        <div className="flex items-center gap-2"><Logo /><span className="rounded-md bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-900">Admin</span></div>
        <h1 className="text-xl font-bold">Admin login</h1>
        <Field label="Email"><input className={input} type="email" required autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Password"><input className={input} type="password" required autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <ErrorText msg={status.error} />
        <button className={`${button} w-full`} disabled={status.busy}>{status.busy ? 'Signing in…' : 'Sign in'}</button>
        <Link href="/" className="block text-center text-sm text-slate-500 hover:text-slate-800">Back to the site</Link>
      </form>
    </div>
  );
}
