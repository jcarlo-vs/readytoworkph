'use client';
import { FeedbackDialog, openFeedback } from '@/components/Feedback';
import Link from 'next/link';
import { band, button, buttonGold, buttonGhost, card } from './styles';
import { StatusPage } from './StatusPage';
export { band, button, buttonGold, buttonGhost, card };

// The dark-green band that opens a page: names where you are, with the page's main actions and key
// numbers (BandStat) inside. One per page.
export function PageBand({ eyebrow, title, sub, actions, children }: {
  eyebrow?: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <section className={`${band} space-y-6 px-6 py-7 sm:px-8`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="text-sm font-medium text-emerald-300">{eyebrow}</p>}
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">{title}</h1>
          {sub && <p className="mt-1 text-emerald-100/80">{sub}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

// A number tile inside the band. Gold for the one number that matters most on the page.
export function BandStat({ label, value, hint, href, gold = false }: { label: string; value: React.ReactNode; hint?: string; href?: string; gold?: boolean }) {
  const body = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-200/80">{label}</p>
      <p className={`mt-1 font-display text-3xl font-bold tabular-nums ${gold ? 'text-amber-400' : 'text-white'}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-emerald-100/70">{hint}</p>}
    </>
  );
  const cls = 'block rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/10';
  return href
    ? <Link href={href} className={`${cls} transition hover:bg-white/[0.12]`}>{body}</Link>
    : <div className={cls}>{body}</div>;
}
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { API, api, photoStore, useApi, type User } from '@/lib/api';
import { timeAgo, fullDate } from '@/lib/time';

// Relative time that re-renders every minute so "5m ago" stays accurate; hover shows the exact time.
export function TimeAgo({ date }: { date: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return <time dateTime={date} title={fullDate(date)}>{timeAgo(date, now)}</time>;
}

export const input = 'w-full rounded-xl border border-emerald-950/10 bg-emerald-50/40 px-3.5 py-2.5 text-sm transition focus:border-emerald-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20';

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

export function Skills({ skills }: { skills: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {skills.map((s) => (
        <span key={s} className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-600/15">{s}</span>
      ))}
    </div>
  );
}

export function BackButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href}
      className="group inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-2 pl-2.5 pr-4 text-sm font-medium text-slate-700 shadow-sm transition hover:border-emerald-600 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/30">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 transition group-hover:-translate-x-0.5 group-hover:bg-emerald-50">
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5l-5 5 5 5" />
        </svg>
      </span>
      {children}
    </Link>
  );
}

// Search button content: a spinner while the results page is loading, so every click visibly registers.
export const SearchLabel = ({ pending }: { pending: boolean }) =>
  pending ? <span className="inline-flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />Searching…</span> : <>Search</>;

export const ErrorText =({ msg }: { msg: string }) =>
  msg ? <p className="text-sm text-red-600" role="alert">{msg}</p> : null;

// A boxed message with an icon, for form results that need more than one red line:
// what happened, and what to do next (children: hints and links).
export function FormAlert({ tone, title, children }: { tone: 'error' | 'success'; title: string; children?: React.ReactNode }) {
  const error = tone === 'error';
  return (
    <div role={error ? 'alert' : 'status'} className={`flex gap-3 rounded-lg border p-3.5 text-sm ${error ? 'border-red-200 bg-red-50 text-red-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
      <svg viewBox="0 0 24 24" className={`mt-0.5 h-5 w-5 shrink-0 ${error ? 'text-red-500' : 'text-emerald-600'}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {error ? <><circle cx="12" cy="12" r="9" /><path d="M12 8v4.5M12 16h.01" /></> : <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.5 2.5L16 9.5" /></>}
      </svg>
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        {children && <div className="space-y-1 [&_a]:font-semibold [&_a]:underline [&_a]:underline-offset-2">{children}</div>}
      </div>
    </div>
  );
}

// Full-page message when a page's main data can't load: missing things (404) get a way out,
// anything else (server trouble, no internet) gets a Try again button.
export function LoadError({ msg, status, onRetry, back = ['/jobs', 'Browse jobs'] }: { msg: string; status: number; onRetry: () => void; back?: [string, string] }) {
  if (status === 404) return (
    <StatusPage code="404" title={msg} text="It may have been removed, or the link may be wrong.">
      <Link href={back[0]} className={button}>{back[1]}</Link>
      <Link href="/" className={buttonGhost}>Go to homepage</Link>
    </StatusPage>
  );
  return (
    <StatusPage code="Oops" title="We couldn’t load this page" text={msg}>
      <button type="button" onClick={onRetry} className={button}>Try again</button>
      <Link href="/" className={buttonGhost}>Go to homepage</Link>
    </StatusPage>
  );
}

// Initials in a circle; with `id`, the user's photo covers them (users without one get a transparent image).
// If the photo fails to load for any reason, it hides itself so the initials show instead of a broken image.
export function Initials({ name, id, size = 'h-12 w-12 text-base' }: { name: string; id?: number; size?: string }) {
  const v = useSyncExternalStore(photoStore.subscribe, photoStore.version, () => 0);
  return (
    <span className={`${size} relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-emerald-700 to-emerald-950 font-semibold text-white`}>
      {name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
      {/* eslint-disable-next-line @next/next/no-img-element -- served from our API via a signed redirect */}
      {id && <img key={v} src={`${API}/users/${id}/photo?v=${v}`} alt="" loading="lazy" onError={(e) => { e.currentTarget.hidden = true; }} className="absolute inset-0 h-full w-full object-cover" />}
    </span>
  );
}

// Concept B "Remote Sunrise": a sun rising out of a laptop screen.
export function Logo({ light = false }: { light?: boolean }) {
  const line = light ? '#ffffff' : '#022c22';
  return (
    <Link href="/" aria-label="ReadyToWork.ph home" className="flex items-center gap-2 font-display text-[1.4rem] leading-none tracking-tight">
      <svg viewBox="0 0 64 64" className="h-9 w-9" aria-hidden="true">
        <rect x="10" y="12" width="44" height="30" rx="4" fill="none" stroke={line} strokeWidth="4" />
        <path d="M22 40A10 10 0 0 1 42 40Z" fill="#fbbf24" />
        {[0, -42, 42, -78, 78].map((deg) => (
          <rect key={deg} x="30.75" y="21" width="2.5" height="5" rx="1.25" fill="#fbbf24" transform={`rotate(${deg} 32 40)`} />
        ))}
        <rect x="4" y="46" width="56" height="5" rx="2.5" fill={line} />
      </svg>
      <span>
        <span className={`font-medium ${light ? 'text-emerald-100' : 'text-slate-700'}`}>ReadyToWork</span>
        <span className={`font-extrabold ${light ? 'text-amber-400' : 'text-emerald-950'}`}>.ph</span>
      </span>
    </Link>
  );
}

// Avatar button that opens a small account menu: workers get My Profile and My Applications; employers get
// My Jobs, Hiring analytics and Plan & billing (where their plan card, switching and Paddle's billing page live).
function ProfileMenu({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const item = 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100';
  const icon = { viewBox: '0 0 24 24', className: 'h-4 w-4 text-slate-400', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
  const close = () => setOpen(false);

  return (
    <div ref={root} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="profile-menu" aria-label="Account menu"
        className={`flex items-center gap-2 rounded-full border bg-white py-1 pl-1 pr-2.5 transition hover:border-slate-300 ${open ? 'border-emerald-600 ring-2 ring-emerald-600/20' : 'border-slate-200'}`}>
        <Initials name={user.name} id={user.id} size="h-8 w-8 text-xs" />
        <span className="hidden max-w-32 truncate text-sm font-medium text-slate-700 md:block">{user.name.split(' ')[0]}</span>
        <svg viewBox="0 0 20 20" className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
          <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div id="profile-menu" className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10">
          <div className="mb-1 flex items-center gap-3 border-b border-slate-100 px-3 pb-3 pt-2">
            <Initials name={user.name} id={user.id} size="h-10 w-10 text-sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
              <p className="truncate text-xs text-slate-500">{user.email}</p>
              <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold capitalize text-emerald-800">{user.role}</span>
              {user.role === 'employer' && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-600">
                  <span>{{ free: 'Free', pro: 'Pro', premium: 'Premium' }[user.plan ?? 'free']} plan</span>
                  {(user.plan ?? 'free') !== 'premium' && (
                    <>· <Link href="/pricing" onClick={close} className="font-semibold text-emerald-700 hover:text-emerald-900">Upgrade</Link></>
                  )}
                </p>
              )}
            </div>
          </div>
          {user.role === 'worker' && (
            <Link href="/profile" onClick={close} className={item}>
              <svg {...icon}><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" /></svg>My Profile
            </Link>
          )}
          <Link href="/dashboard" onClick={close} className={item}>
            <svg {...icon}><path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" /></svg>{user.role === 'worker' ? 'My Applications' : 'My Jobs'}
          </Link>
          {user.role === 'employer' && (
            <>
              <Link href="/workers?view=saved" onClick={close} className={item}>
                <svg {...icon}><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3Z" /></svg>Saved workers
              </Link>
              <Link href="/dashboard/analytics" onClick={close} className={item}>
                <svg {...icon}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>Hiring analytics
                {user.plan !== 'premium' && <span className="ml-auto rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-900">Premium</span>}
              </Link>
              <Link href="/pricing" onClick={close} className={item}>
                <svg {...icon}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h3" /></svg>Plan &amp; billing
              </Link>
            </>
          )}
          <Link href="/account" onClick={close} className={item}>
            <svg {...icon}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>Account settings
          </Link>
          <Link href="/contact" onClick={close} className={item}>
            <svg {...icon}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5v.5M12 17h.01" /></svg>Help &amp; support
          </Link>
          <button type="button" onClick={() => { close(); openFeedback(); }} className={item}>
            <svg {...icon}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" /></svg>Send feedback
          </button>
          <div className="my-1 border-t border-slate-100" />
          <button type="button" onClick={() => { close(); onSignOut(); router.push('/'); }} className={`${item} text-red-600 hover:bg-red-50`}>
            <svg {...icon} className="h-4 w-4 text-red-400"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /></svg>Log out
          </button>
        </div>
      )}
    </div>
  );
}

// Shown to signed-in people who haven't confirmed their email yet, with a way to get a new link.
export function ConfirmEmailBanner({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | string>('idle');
  async function resend() {
    setState('busy');
    try {
      await api('/auth/verify/resend', { method: 'POST', quiet: true });
      setState('sent');
    } catch (err) {
      setState((err as Error).message);
    }
  }
  return (
    <div className="border-t border-amber-200 bg-amber-50 text-sm text-amber-950">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
        <span>📩 Please confirm your email. We sent a link to <b>{email}</b> (check Spam too).</span>
        {state === 'sent' ? <span className="font-semibold text-emerald-800">New link sent ✓</span>
          : <button type="button" onClick={resend} disabled={state === 'busy'} className="font-semibold text-emerald-800 underline-offset-2 hover:underline disabled:opacity-50">{state === 'busy' ? 'Sending…' : 'Send a new link'}</button>}
        {!['idle', 'busy', 'sent'].includes(state) && <span className="text-red-700">{state}</span>}
      </div>
    </div>
  );
}

export function Nav() {
  const { user, signOut } = useAuth();
  const { data: unread, reload: reloadUnread } = useApi<{ count: number }>(user ? '/messages/unread-count' : null, 30000);
  useEffect(() => {
    window.addEventListener('rp:unread-changed', reloadUnread);
    return () => window.removeEventListener('rp:unread-changed', reloadUnread);
  });
  const link = 'px-1.5 py-2 font-medium text-slate-600 hover:text-emerald-700';
  // The section you're in is a dark pill with a gold icon; the others are quiet until hovered.
  const path = usePathname();
  const section = (match: string) =>
    `inline-flex items-center gap-2 rounded-xl px-4 py-2 font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/30 ${
      path.startsWith(match)
        ? 'border border-emerald-950 bg-emerald-950 text-white shadow-sm [&>svg]:text-amber-400'
        : 'border border-emerald-200 bg-white text-emerald-900 shadow-sm hover:border-emerald-600 hover:bg-emerald-50 [&>svg]:text-emerald-600'}`;
  const icon = { viewBox: '0 0 24 24', className: 'h-4 w-4', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
  if (path.startsWith('/admin')) return null; // the admin has its own menu and login
  return (
    <header className="sticky top-0 z-20 border-b border-emerald-950/5 bg-[#f3f7f4]/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2.5 gap-y-2 px-4 py-3 text-sm">
        <div className="mr-auto"><Logo /></div>
        {/* Workers and visitors see Find Jobs; Hire Talent and My Jobs are for signed-in employers (talent isn't public). */}
        {user?.role !== 'employer' && (
          <Link href="/jobs" className={section('/jobs')} aria-current={path.startsWith('/jobs') ? 'page' : undefined}>
            <svg {...icon}><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>
            Find Jobs
          </Link>
        )}
        {user?.role === 'employer' && (
          <Link href="/workers" className={section('/workers')} aria-current={path.startsWith('/workers') ? 'page' : undefined}>
            <svg {...icon}><path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM3 20a6 6 0 0 1 12 0M16 4a3.5 3.5 0 0 1 0 7M21 20a5 5 0 0 0-3.5-4.8" /></svg>
            Hire Talent
          </Link>
        )}
        {user?.role === 'employer' && (
          <Link href="/dashboard" className={section('/dashboard')} aria-current={path.startsWith('/dashboard') ? 'page' : undefined}>
            <svg {...icon}><path d="M4 8h16v11H4zM9 8V5h6v3M4 13h16" /></svg>
            My Jobs
          </Link>
        )}
        <span aria-hidden="true" className="mx-1.5 hidden h-6 w-px bg-slate-200 sm:block" />
        {user ? (
          <>
            <Link href="/messages" aria-label={unread?.count ? `Messages, ${unread.count} unread` : 'Messages'}
              className="inline-flex items-center gap-2 rounded-lg px-2.5 py-2 font-medium text-slate-600 hover:bg-slate-50 hover:text-emerald-700">
              <svg {...icon}><path d="M4 5h16v11H8l-4 4V5Z" /></svg>
              Messages
              {!!unread?.count && (
                <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[11px] font-bold leading-none text-slate-900">
                  {unread.count > 99 ? '99+' : unread.count}
                </span>
              )}
            </Link>
            {user.role === 'employer' && <Link href="/jobs/new" className={buttonGold}>Post a Job</Link>}
            <ProfileMenu user={user} onSignOut={signOut} />
          </>
        ) : (
          <>
            <Link href="/login" className={link}>Log in</Link>
            <Link href="/jobs/new" className={buttonGold}>Post a Job</Link>
            <Link href="/register" className={button}>Sign up free</Link>
          </>
        )}
      </nav>
      {user?.email_verified === false && <ConfirmEmailBanner email={user.email} />}
    </header>
  );
}

export function Footer() {
  const { user } = useAuth();
  const path = usePathname();
  if (path.startsWith('/admin')) return null;
  const col = (title: string, links: [string, string][]) => (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-white">{title}</h3>
      <ul className="space-y-2 text-sm">
        {links.map(([label, href]) => <li key={label}><Link href={href} className="hover:text-white">{label}</Link></li>)}
      </ul>
    </div>
  );
  return (
    <footer className="mt-20 bg-emerald-950 text-emerald-100/70">
      <FeedbackDialog />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <Logo light />
          <p className="text-sm leading-relaxed">Remote jobs for Filipino professionals. Employers hire direct, with no agency markups, and workers always join free.</p>
          <Link href="/contact" className="inline-block text-sm font-medium text-emerald-100 hover:text-white">support@readytowork.ph</Link>
        </div>
        {/* Visitors get sign-up links; signed-in people get their own pages in the same spots. */}
        {col('Find work', [['Browse remote jobs', '/jobs'], ['Full-time jobs', '/jobs?type=full-time'], ['Part-time jobs', '/jobs?type=part-time'], ['Gigs and projects', '/jobs?type=gig'],
          ...(user?.role === 'worker' ? [['My profile', '/profile'], ['My applications', '/dashboard']] as [string, string][]
            : user ? [] : [['Create a free profile', '/register?role=worker']] as [string, string][])])}
        {col('Hire talent', user?.role === 'worker'
          ? [['Pricing for employers', '/pricing']]
          : user?.role === 'employer'
            ? [['Post a job', '/jobs/new'], ['Browse talent', '/workers'], ['My jobs', '/dashboard'], ['Plan & billing', '/pricing']]
            : [['Post a job', '/jobs/new'], ['Pricing', '/pricing'], ['Sign up as an employer', '/register?role=employer']])}
        <div>
          {col('Help', [['Frequently asked questions', '/pricing#faq'], ['Contact us', '/contact']])}
          <button type="button" onClick={openFeedback} className="mt-2 text-sm hover:text-white">Send feedback</button>
        </div>
      </div>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 border-t border-white/10 px-4 py-6 text-xs">
        <span>© 2026 ReadyToWork.ph. All rights reserved.</span>
        <nav className="flex flex-wrap gap-4">
          <Link href="/terms" className="hover:text-white">Terms</Link>
          <Link href="/privacy" className="hover:text-white">Privacy</Link>
          <Link href="/refunds" className="hover:text-white">Refunds</Link>
        </nav>
      </div>
    </footer>
  );
}
