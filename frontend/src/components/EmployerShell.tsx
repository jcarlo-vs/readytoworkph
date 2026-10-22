'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { FeedbackDialog, openFeedback } from '@/components/Feedback';
import { ApplicantsBell, ConfirmEmailBanner, Flash, Initials, Logo, buttonGold, usesEmployerShell } from '@/components/ui';

// Signed-in employers get their own app: a dark side menu and a slim top bar instead of the site's
// header and footer (see usesEmployerShell for where it applies).

const icon = { viewBox: '0 0 24 24', className: 'h-4 w-4 shrink-0', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
type Item = { href: string; label: string; active: (p: string) => boolean; svg: React.ReactNode; badge?: 'unread' | 'new' | 'premium' };
// Grouped like an app: everyday items on top, then Hiring, Browse and Account. Headings aren't clickable;
// every item is always visible.
const MENU: { group?: string; items: Item[] }[] = [
  { items: [
    { href: '/dashboard', label: 'Dashboard', active: (p) => p === '/dashboard', svg: <path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" /> },
    { href: '/messages', label: 'Messages', active: (p) => p.startsWith('/messages'), svg: <path d="M4 5h16v11H8l-4 4V5Z" />, badge: 'unread' },
  ] },
  { group: 'Hiring', items: [
    { href: '/dashboard/jobs', label: 'My Job Posts', active: (p) => p.startsWith('/dashboard/jobs') || p.startsWith('/dashboard/applicants') || p === '/jobs/new' || /^\/jobs\/\d+\/edit/.test(p), svg: <path d="M4 8h16v11H4zM9 8V5h6v3M4 13h16" />, badge: 'new' },
    { href: '/workers?view=saved', label: 'Saved Workers', active: () => false, svg: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3Z" /> },
    { href: '/dashboard/hires', label: 'My Hires', active: (p) => p.startsWith('/dashboard/hires'), svg: <path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6m7 1 2 2 4-4" /> },
  ] },
  { group: 'Browse', items: [
    { href: '/workers', label: 'Hire Talent', active: (p) => p.startsWith('/workers'), svg: <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></> },
    { href: '/jobs', label: 'Job Board', active: (p) => p === '/jobs', svg: <path d="M3 5h18v14H3zM3 9h18M8 14h4" /> },
  ] },
  { group: 'Account', items: [
    { href: '/dashboard/analytics', label: 'Analytics', active: (p) => p.startsWith('/dashboard/analytics'), svg: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />, badge: 'premium' },
    { href: '/pricing', label: 'Plan & Billing', active: (p) => p.startsWith('/pricing'), svg: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h3" /></> },
    { href: '/account', label: 'Settings', active: (p) => p.startsWith('/account'), svg: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" /></> },
  ] },
];
const PLAN = { free: 'Free', pro: 'Pro', premium: 'Premium' } as const;

export function EmployerShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const on = usesEmployerShell(user, path);
  const { data: unread, reload } = useApi<{ count: number }>(on ? '/messages/unread-count' : null, 30000);
  const { data: fresh, reload: reloadFresh } = useApi<{ count: number }>(on ? '/my/new-applicants' : null, 30000);
  useEffect(() => {
    window.addEventListener('rp:unread-changed', reload);
    window.addEventListener('rp:applicants-seen', reloadFresh);
    return () => { window.removeEventListener('rp:unread-changed', reload); window.removeEventListener('rp:applicants-seen', reloadFresh); };
  });
  if (!on || !user) return <>{children}</>;
  const plan = user.plan ?? 'free';

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <FeedbackDialog />
      {/* Below lg the menu is a scrollable strip on top; from lg it's a fixed-height column on the left. */}
      <aside className="flex shrink-0 flex-col bg-emerald-950 text-emerald-100 lg:sticky lg:top-0 lg:h-screen lg:w-56">
        <div className="px-4 pb-3 pt-4 [&_svg]:h-7 [&_svg]:w-7 [&_a]:text-lg"><Logo light /></div>
        <nav aria-label="Employer menu" className="flex gap-1 overflow-x-auto px-2 pb-2 text-sm lg:flex-col lg:gap-0 lg:overflow-y-auto">
          {MENU.map((g, i) => (
            <div key={i} className="contents lg:block">
              {g.group && <p className="hidden px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-emerald-300/70 lg:block">{g.group}</p>}
              {g.items.map((m) => {
                const active = m.active(path);
                const count = m.badge === 'unread' ? unread?.count : m.badge === 'new' ? fresh?.count : 0;
                return (
                  <Link key={m.label} href={m.href} aria-current={active ? 'page' : undefined}
                    className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-1.5 whitespace-nowrap transition lg:my-px ${active ? 'bg-white/10 font-semibold text-white' : 'hover:bg-white/5 hover:text-white'}`}>
                    <svg {...icon}>{m.svg}</svg>
                    {m.label}
                    {!!count && <span className="ml-auto rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-slate-900">{count > 99 ? '99+' : m.badge === 'new' ? `${count} new` : count}</span>}
                    {m.badge === 'premium' && plan !== 'premium' && <span className="ml-auto rounded bg-white/10 px-1.5 text-[10px] font-semibold uppercase text-amber-200">Premium</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="mt-auto hidden space-y-1 border-t border-white/10 p-3 text-sm lg:block">
          <div className="flex items-center gap-2.5 px-1 pb-2">
            <Initials name={user.name} id={user.id} size="h-8 w-8 text-xs" />
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{user.name}</p>
              <p className="text-xs">{PLAN[plan]} plan{plan !== 'premium' && <> · <Link href="/pricing" className="font-semibold text-amber-300 hover:text-amber-200">Upgrade</Link></>}</p>
            </div>
          </div>
          <Link href="/contact" className="block rounded-lg px-2 py-1.5 hover:bg-white/5 hover:text-white">Help &amp; support</Link>
          <button type="button" onClick={openFeedback} className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/5 hover:text-white">Send feedback</button>
          <button type="button" onClick={() => { signOut(); router.push('/'); }} className="block w-full rounded-lg px-2 py-1.5 text-left text-red-300 hover:bg-white/5">Log out</button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-emerald-950/5 bg-white/90 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-2.5 lg:px-6">
            <div className="ml-auto flex items-center gap-2">
              <ApplicantsBell />
              <Link href="/jobs/new" className={`${buttonGold} px-4 py-1.5 text-sm`}>Post a job</Link>
              <Link href="/account" aria-label="Account settings" className="lg:hidden"><Initials name={user.name} id={user.id} size="h-8 w-8 text-xs" /></Link>
            </div>
          </div>
          {user.email_verified === false && <ConfirmEmailBanner email={user.email} />}
          <Flash />
        </header>
        <div data-shell className="flex-1 text-sm">{children}</div>
      </div>
    </div>
  );
}
