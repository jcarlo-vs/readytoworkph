'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api, useApi, type User } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { band, button, buttonGhost, buttonGold, FormAlert } from '@/components/ui';

// Features starting with NOT are shown crossed out, as what the plan doesn't include.
const NOT = '✗ ';

type Plan = {
  name: string; monthly: number; blurb: string; popular?: boolean; features: string[]; cta: [string, string];
};
const PLANS: Plan[] = [
  {
    name: 'Free', monthly: 0, blurb: 'For trying ReadyToWork.ph and occasional hiring.',
    features: ['Up to 3 job posts per month', 'See your top 20 applicants per job', 'View job applications', 'Reply to your applicants', '10 AI fit scores per month', 'Applicants sorted by interest (Credits)', NOT + 'Reach out to workers first'],
    cta: ['Post a job free', '/jobs/new'],
  },
  {
    name: 'Pro', monthly: 19, blurb: 'For growing teams hiring every month.',
    features: ['Up to 5 job posts per month', 'See your top 150 applicants per job', 'View job applications', 'Reach out to any worker first', '500 AI fit scores per month', 'AI reads resumes, cover letters and profiles'],
    cta: ['Get Pro', 'mailto:support@readytowork.ph?subject=Upgrade%20to%20Pro'],
  },
  {
    name: 'Premium', monthly: 49, blurb: 'For agencies and high-volume hiring.', popular: true,
    features: ['Up to 10 job posts per month', 'See every applicant, no limit', 'View job applications', 'Reach out to any worker first', 'Unlimited AI fit scores', 'Score all applicants in one click, not one by one', 'Your own hiring analytics dashboard', 'Priority support'],
    cta: ['Get Premium', 'mailto:support@readytowork.ph?subject=Upgrade%20to%20Premium'],
  },
];
const YEARLY_MONTHS = 10; // yearly = 2 months free

const WHY = [
  ['Hire direct', 'Talk to workers yourself, agree on pay together, and pay them directly. No middleman in between.'],
  ['No markups, no cut', 'We never take a percentage of salaries. Workers keep 100% of what you pay them.'],
  ['Serious applicants first', 'Workers bid Credits to show how much they want your job, so the most interested rise to the top.'],
  ['AI that reads for you', 'Score each applicant against your job in seconds, with clear strengths and concerns.'],
];

const FAQ: [string, [string, string][]][] = [
  ['Plans and pricing', [
    ['What does the Free plan include?', 'You can post up to 3 jobs a month, see your top 20 applicants on each job (most interested first), read their applications and reply to them. Workers can keep applying; upgrade anytime to see everyone who applied. It’s enough to see the quality of talent before you pay anything.'],
    ['Why can’t I message workers first on the Free plan?', 'Free accounts that could message anyone would quickly attract spammers and fake “job offers”, and workers would stop trusting messages. Keeping outreach to paid plans protects workers, keeps quality high, and keeps ReadyToWork.ph running.'],
    ['Why pay a subscription instead of a fee per hire?', 'Agencies and many freelance sites add a markup on every hour you pay, for as long as the person works for you. We charge a simple monthly price instead, so once you hire someone, every peso of their pay goes to them.'],
    ['Monthly or yearly?', `Yearly costs the same as ${YEARLY_MONTHS} months, so you get 2 months free. It suits teams that hire regularly.`],
    ['Can I both hire and look for work?', 'Yes. Each account is either for hiring or for finding work, which keeps job seekers and employers clearly apart. To do both, create a second account with a different email address.'],
    ['Can I switch plans later?', 'Yes. You can move from Free to Pro or Premium, from Pro to Premium, or from monthly to yearly whenever you need more.'],
    ['Is Premium’s AI really unlimited?', 'Yes, for any real hiring. A fair-use limit of 10,000 AI fit scores a month only stops automated abuse; that’s hundreds of applicants a day, every day.'],
    ['Do limits reset?', 'Yes. Job posts and AI fit scores reset on the 1st of every month (Philippine time). Applicant limits are per job and don’t reset: upgrading shows everyone who already applied.'],
    ['What happens when a job reaches its application limit?', 'It stops accepting new applications and workers see that it’s full. Upgrade to receive more applications on your jobs.'],
    ['What is an AI Fit Score?', 'A score from 0 to 100 for how well one applicant fits your job post, with their strengths and concerns. Opening a score again is free; asking the AI to re-score uses one.'],
  ]],
  ['Cancelling', [
    ['Do I have to stay subscribed after I hire someone?', 'No. There are no contracts or minimum terms. Many employers subscribe while hiring and cancel once their team is set. You keep your job history and your conversations.'],
    ['How do I cancel?', 'Once online checkout launches, you’ll cancel from your account in a couple of clicks. Until then, email support@readytowork.ph and we’ll take care of it.'],
    ['Can I get a refund?', 'Yes, on your first payment: if a paid plan isn’t right for you, ask within 14 days and you’ll get your money back in full. Renewals aren’t refunded, but you can cancel anytime and keep your plan until the end of the period you paid for. See our Refund Policy at readytowork.ph/refunds.'],
  ]],
  ['Hiring and trust', [
    ['How do I pay the people I hire?', 'Directly, using whatever you both agree on, such as Wise, PayPal or a bank transfer. ReadyToWork.ph isn’t involved in salaries and never takes a cut.'],
    ['How do I know if a worker is trustworthy?', 'Read their profile, resume and cover letter, use the AI score to spot gaps, and talk to them before hiring. Many employers start with a small paid test task. Filipino professionals are known for strong English and a long track record of working with overseas teams.'],
    ['Is it free for workers?', 'Yes, always. Workers never pay to create a profile or apply, which is why so many skilled people are here.'],
  ]],
];

const Check = () => (
  <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m4 10.5 4 4 8-9" />
  </svg>
);
const Cross = () => (
  <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <path d="m5.5 5.5 9 9m0-9-9 9" />
  </svg>
);
const money = (n: number) => `$${n % 1 ? n.toFixed(2) : n}`;
const NAME: Record<string, string> = { free: 'Free', pro: 'Pro', premium: 'Premium' };
const RANK: Record<string, number> = { free: 0, pro: 1, premium: 2 };
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
type Subscription = { plan: string; yearly: boolean; status: string; next_billed_at: string | null; cancels_at: string | null };
type Preview = { today: number; credit: number; next_billed_at: string | null };
type Change = { plan: string; yearly: boolean; preview?: Preview; error?: string; busy?: boolean };

// Paddle's checkout opens over the page. Paddle.js is only loaded when someone actually upgrades.
type BillingConfig = { token: string | null; environment: 'sandbox' | 'production' };
type PaddleJs = {
  Environment: { set: (env: string) => void };
  Initialize: (o: { token: string; eventCallback: (e: { name?: string }) => void }) => void;
  Checkout: { open: (o: { transactionId: string; customer?: { email: string } }) => void; close: () => void };
};
let paddle: Promise<PaddleJs> | null = null;
const PAID = 'paddle-checkout-completed';
const loadPaddle = (cfg: BillingConfig) => paddle ??= new Promise((resolve, reject) => {
  const s = document.createElement('script');
  s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
  s.onload = () => {
    const P = (window as unknown as { Paddle: PaddleJs }).Paddle;
    if (cfg.environment === 'sandbox') P.Environment.set('sandbox');
    P.Initialize({ token: cfg.token!, eventCallback: (e) => {
      if (e.name !== 'checkout.completed') return;
      window.dispatchEvent(new Event(PAID));
      setTimeout(() => P.Checkout.close(), 2000); // long enough to see Paddle's success tick
    } });
    resolve(P);
  };
  s.onerror = () => { paddle = null; s.remove(); reject(new Error('Couldn’t open the checkout. Check your internet connection and try again.')); };
  document.head.appendChild(s);
});

// One line of the plan card's "this month" strip: how much of an allowance is used.
function Meter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  return (
    <div>
      <p className="flex justify-between gap-2 text-sm">
        <span className="text-emerald-100">{label}</span>
        <span className="font-semibold">{limit === null ? <>{used} · Unlimited</> : <>{used} of {limit}</>}</span>
      </p>
      {limit !== null && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.min(100, (used / Math.max(limit, 1)) * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

export default function PricingPage() {
  const [yearly, setYearly] = useState(false);
  const { user, signIn } = useAuth();
  const { data: billing } = useApi<BillingConfig>('/billing/config');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [paid, setPaid] = useState(false);
  const { data: stats } = useApi<{ upgraded_this_month: number }>('/stats');

  // Paddle tells the backend about the payment a few seconds after checkout; until then the account
  // still says Free, so check back for a little while.
  const signInRef = useRef(signIn); // signIn is a new function every render; the poll must not restart
  useEffect(() => { signInRef.current = signIn; });
  useEffect(() => {
    let live = true;
    const paid = async () => {
      setPaid(true);
      for (let i = 0; i < 30 && live; i++) {
        await new Promise((ok) => setTimeout(ok, 2000));
        const u = await api<User>('/me', { quiet: true }).catch(() => null);
        if (live && u && u.plan !== 'free') return signInRef.current(u);
      }
    };
    window.addEventListener(PAID, paid);
    return () => { live = false; window.removeEventListener(PAID, paid); };
  }, []);

  // Employers already paying switch plans on their subscription (with a preview of today's charge)
  // instead of going through checkout again.
  const paying = !!billing?.token && user?.role === 'employer' && !!user.plan && user.plan !== 'free';
  const { data: subData, reload: reloadSub } = useApi<{ subscription: Subscription | null }>(paying ? '/billing/subscription' : null);
  const sub = subData?.subscription ?? null;
  const [shownSub, setShownSub] = useState<Subscription | null>(null);
  if (sub && sub !== shownSub) { setShownSub(sub); setYearly(sub.yearly); } // open on their billing period
  const { data: quota } = useApi<{ posted: number; limit: number }>(sub ? '/my/job-quota' : null);
  const { data: usage } = useApi<{ used: number; limit: number | null }>(sub ? '/analyzer/usage' : null);
  const [change, setChange] = useState<Change | null>(null);
  const [switched, setSwitched] = useState('');

  async function openPortal() {
    setError(''); setBusy('portal');
    try {
      window.location.assign((await api<{ url: string }>('/billing/portal', { method: 'POST' })).url);
    } catch (e) {
      setError((e as Error).message); setBusy('');
    }
  }
  async function previewChange(plan: string) {
    setError(''); setSwitched('');
    setChange({ plan, yearly });
    try {
      const r = await api<{ preview: Preview }>('/billing/change', { body: { plan, yearly } });
      setChange((c) => c && { ...c, preview: r.preview });
    } catch (e) {
      setChange((c) => c && { ...c, error: (e as Error).message });
    }
  }
  async function confirmChange() {
    if (!change) return;
    setChange({ ...change, busy: true, error: '' });
    try {
      await api('/billing/change', { body: { plan: change.plan, yearly: change.yearly, confirm: true } });
      const u = await api<User>('/me', { quiet: true });
      signIn(u);
      reloadSub();
      setSwitched(`You’re on ${NAME[change.plan]}${change.yearly ? ' yearly' : ''} now. Your receipt is on its way to your email.`);
      setChange(null);
    } catch (e) {
      setChange({ ...change, busy: false, error: (e as Error).message });
    }
  }

  async function upgrade(plan: string) {
    if (sub) return previewChange(plan);
    setError(''); setBusy(plan);
    try {
      const r = await api<{ transaction_id?: string; email?: string | null }>('/billing/checkout', { body: { plan, yearly } });
      const P = await loadPaddle(billing!);
      P.Checkout.open({ transactionId: r.transaction_id!, ...(r.email && { customer: { email: r.email } }) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  // Only brag with a real number once it's worth showing.
  const upgraded = stats && stats.upgraded_this_month >= 10 ? stats.upgraded_this_month : null;

  return (
    <div className="mx-auto max-w-5xl space-y-16">
      <header className="mx-auto max-w-3xl space-y-4 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Pricing for employers</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          {upgraded
            ? <><span className="text-emerald-700">{upgraded.toLocaleString()}</span> employers upgraded this month</>
            : <>Hire direct. <span className="text-emerald-700">No stress.</span></>}
        </h1>
        <p className="text-lg text-slate-600">
          No agency markups. No cut of salaries. Just you and great Filipino talent.
        </p>
        <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 pt-1 text-sm font-medium text-slate-700">
          {['Hire great talent directly', 'Cancel anytime', 'Workers keep 100% of their pay'].map((t) => (
            <li key={t} className="flex items-center gap-1.5"><Check />{t}</li>
          ))}
        </ul>
      </header>

      <div className="space-y-8">
        {sub && (
          <section aria-label="Your plan" className="overflow-hidden rounded-2xl bg-emerald-950 text-white shadow-sm">
            <div className="flex flex-wrap items-center gap-5 p-6">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-emerald-950" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.8 4.9L19 9.7l-4.2 3.1 1.4 5.2L12 15l-4.2 3 1.4-5.2L5 9.7l5.2-1.8L12 3Z" /></svg>
              </span>
              <div className="min-w-48 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Your plan</p>
                <p className="text-2xl font-bold">{NAME[sub.plan]} <span className="text-base font-medium text-emerald-200">· {sub.yearly ? 'Yearly' : 'Monthly'}</span></p>
                {sub.cancels_at ? <p className="mt-1 inline-block rounded-full bg-amber-400/20 px-2.5 py-0.5 text-xs font-semibold text-amber-200">Ends {day(sub.cancels_at)}, then Free</p>
                  : sub.status === 'past_due' ? <p className="mt-1 inline-block rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-semibold text-red-200">Payment failed. Update your card in Manage billing</p>
                  : sub.next_billed_at ? <p className="mt-0.5 text-sm text-emerald-100">Renews {day(sub.next_billed_at)}</p> : null}
              </div>
              <button type="button" onClick={openPortal} disabled={!!busy}
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50 disabled:opacity-60">
                {busy === 'portal' ? 'Opening…' : 'Manage billing'}
              </button>
            </div>
            {(quota || usage) && (
              <div className="grid gap-4 border-t border-white/10 bg-white/5 px-6 py-4 sm:grid-cols-2">
                {quota && <Meter label="Job posts this month" used={quota.posted} limit={quota.limit} />}
                {usage && <Meter label="AI fit scores this month" used={usage.used} limit={usage.limit} />}
              </div>
            )}
          </section>
        )}
        {switched && <FormAlert tone="success" title="Plan switched">{switched}</FormAlert>}
        {paid && (
          <FormAlert tone="success" title={user?.plan && user.plan !== 'free' ? `You’re on ${user.plan === 'pro' ? 'Pro' : 'Premium'}. Thank you!` : 'Payment received. Thank you!'}>
            {user?.plan === 'free' && <p>Your plan switches on in a moment. Your receipt is on its way to your email.</p>}
          </FormAlert>
        )}
        <div className="flex justify-center">
          <div className="inline-flex rounded-full bg-slate-100 p-1 text-sm font-semibold" role="group" aria-label="Billing period">
            <button type="button" aria-pressed={!yearly} onClick={() => setYearly(false)}
              className={`rounded-full px-5 py-2 transition ${!yearly ? 'bg-white text-slate-900 shadow' : 'text-slate-600 hover:text-slate-900'}`}>Monthly</button>
            <button type="button" aria-pressed={yearly} onClick={() => setYearly(true)}
              className={`flex items-center gap-2 rounded-full px-5 py-2 transition ${yearly ? 'bg-white text-slate-900 shadow' : 'text-slate-600 hover:text-slate-900'}`}>
              Yearly <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">2 months free</span>
            </button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {PLANS.map((p) => (
            <section key={p.name} aria-label={`${p.name} plan`}
              className={`relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm ${(sub ? sub.plan === p.name.toLowerCase() : p.popular) ? 'border-emerald-950 ring-2 ring-emerald-950 md:-my-3 md:py-9' : 'border-slate-200'}`}>
              {(sub ? sub.plan === p.name.toLowerCase() : p.popular) && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-slate-900">{sub ? 'Your plan' : 'Most popular'}</span>
              )}
              <h2 className="text-lg font-semibold text-slate-900">{p.name}</h2>
              <p className="mt-1 text-sm text-slate-500">{p.blurb}</p>
              <div className="mt-5 min-h-16">
                <p className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight text-slate-900">{money(yearly ? (p.monthly * YEARLY_MONTHS) / 12 : p.monthly)}</span>
                  <span className="text-sm text-slate-500">/ month</span>
                </p>
                {yearly && p.monthly > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    {money(p.monthly * YEARLY_MONTHS)} billed yearly · <span className="font-semibold text-emerald-700">save {money(p.monthly * 2)}</span>
                  </p>
                )}
              </div>
              <ul className="mt-6 flex-1 space-y-3 text-sm text-slate-700">
                {p.features.map((f) => f.startsWith(NOT)
                  ? <li key={f} className="flex gap-2 text-slate-400"><Cross /><span><span className="sr-only">Not included: </span>{f.slice(NOT.length)}</span></li>
                  : <li key={f} className="flex gap-2"><Check />{f}</li>)}
              </ul>
              {(() => {
                // Subscribers: only an upgrade is the gold button; downgrades stay quiet.
                const featured = sub ? RANK[p.name.toLowerCase()] > RANK[sub.plan] : p.popular;
                const style = `${featured ? buttonGold : p.monthly && !sub ? button : buttonGhost} mt-8 w-full py-3`;
                const plan = p.name.toLowerCase();
                if (!p.monthly && sub) {
                  return sub.cancels_at
                    ? <p className="mt-8 py-3 text-center text-sm text-slate-500">Your account moves here on {day(sub.cancels_at)}</p>
                    : <button type="button" disabled={!!busy} onClick={openPortal} className={`${buttonGhost} mt-8 w-full py-3`}>Cancel to go Free</button>;
                }
                if (!p.monthly && user && user.role !== 'employer') return <button type="button" disabled className={`${style} opacity-50`}>For employer accounts</button>;
                if (!p.monthly) return <Link href={p.cta[1]} className={style}>{p.cta[0]}</Link>;
                if (!billing?.token) return <Link href={`${p.cta[1]}${yearly ? '%20(yearly)' : ''}`} className={style}>{p.cta[0]}</Link>;
                if (!user) return <Link href="/register?role=employer&next=/pricing" className={style}>{p.cta[0]}</Link>;
                if (user.role !== 'employer') return <button type="button" disabled className={`${style} opacity-50`}>For employer accounts</button>;
                if (sub && plan === sub.plan && yearly === sub.yearly) {
                  return <button type="button" disabled={!!busy} onClick={openPortal} className={`${buttonGhost} mt-8 w-full py-3 disabled:opacity-60`}>{busy === 'portal' ? 'Opening…' : 'Manage billing'}</button>;
                }
                const label = !sub ? p.cta[0]
                  : plan === sub.plan ? `Switch to ${yearly ? 'yearly' : 'monthly'}`
                  : RANK[plan] > RANK[sub.plan] ? `Upgrade to ${p.name}` : `Switch to ${p.name}`;
                return (
                  <button type="button" disabled={!!busy || (paying && !subData)} onClick={() => upgrade(plan)} className={`${style} disabled:opacity-60`}>
                    {busy === plan ? 'Opening…' : label}
                  </button>
                );
              })()}
              <p className="mt-2 h-4 text-center text-xs text-slate-500">{p.monthly ? 'Cancel anytime' : sub ? 'Your jobs and applicants stay' : 'No credit card needed'}</p>
            </section>
          ))}
        </div>
        {error && <FormAlert tone="error" title="Something went wrong">{error}</FormAlert>}
        {change && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => !change.busy && setChange(null)}>
            <div role="dialog" aria-modal="true" aria-labelledby="change-title" className="w-full max-w-md space-y-5 rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h2 id="change-title" className="text-lg font-semibold text-slate-900">
                Switch to {NAME[change.plan]} {change.yearly ? 'yearly' : 'monthly'}
              </h2>
              {change.error ? <FormAlert tone="error" title="Can’t switch right now">{change.error}</FormAlert>
                : !change.preview ? <p className="text-sm text-slate-500">Working out the price…</p>
                : (
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between gap-4 rounded-lg bg-slate-50 p-3">
                      <dt className="text-slate-600">Due today<span className="block text-xs text-slate-500">Unused time on your current plan is credited</span></dt>
                      <dd className="text-lg font-bold text-slate-900">{money(change.preview.today)}</dd>
                    </div>
                    {change.preview.credit > 0 && (
                      <div className="flex justify-between gap-4 px-3">
                        <dt className="text-slate-600">Credit for your unused time<span className="block text-xs text-slate-500">Taken off your next bills until it&apos;s used up</span></dt>
                        <dd className="font-semibold text-emerald-700">{money(change.preview.credit)}</dd>
                      </div>
                    )}
                    {change.preview.next_billed_at && (
                      <div className="flex justify-between gap-4 px-3">
                        <dt className="text-slate-600">Then from {day(change.preview.next_billed_at)}</dt>
                        {/* the plan's list price: Paddle's next-bill figure already has credit taken off, which reads like a new price */}
                        <dd className="font-semibold text-slate-900">
                          {money((PLANS.find((x) => x.name.toLowerCase() === change.plan)?.monthly ?? 0) * (change.yearly ? YEARLY_MONTHS : 1))} / {change.yearly ? 'year' : 'month'}
                        </dd>
                      </div>
                    )}
                    <p className="px-3 text-xs text-slate-500">Charged to the card on file{change.preview.credit > 0 && ', after your credit is used up'}. Prices include any sales tax or VAT. Your new plan starts right away.</p>
                  </dl>
                )}
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setChange(null)} disabled={change.busy} className={`${buttonGhost} px-4 py-2`}>Cancel</button>
                {!change.error && (
                  <button type="button" onClick={confirmChange} disabled={!change.preview || change.busy} className={`${buttonGold} px-4 py-2 disabled:opacity-60`}>
                    {change.busy ? 'Switching…' : `Confirm${change.preview?.today ? ` · pay ${money(change.preview.today)}` : ''}`}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        <p className="text-center text-sm text-slate-500">
          {billing?.token
            ? 'Prices in USD and include any sales tax or VAT. Secure checkout by Paddle, our reseller.'
            : <>Prices in USD. Online checkout is coming soon. For now, email us and we&apos;ll upgrade your account.</>}
        </p>
      </div>

      <section className="space-y-6">
        <h2 className="text-center font-display text-2xl font-bold tracking-tight">Why employers choose ReadyToWork.ph</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {WHY.map(([title, text]) => (
            <div key={title} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-semibold text-slate-900">{title}</h3>
              <p className="text-sm leading-relaxed text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 space-y-8">
        <h2 className="text-center font-display text-2xl font-bold tracking-tight">Frequently asked questions</h2>
        {FAQ.map(([group, items]) => (
          <div key={group} className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{group}</h3>
            <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
              {items.map(([q, a]) => (
                <details key={q} className="group px-5 py-4">
                  <summary className="flex items-center justify-between gap-4 font-medium text-slate-900 [&::-webkit-details-marker]:hidden">
                    {q}<span className="text-xl leading-none text-slate-400 transition group-open:rotate-45" aria-hidden="true">+</span>
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{a}</p>
                </details>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className={`${band} space-y-4 px-6 py-10 text-center`}>
        <h2 className="font-display text-2xl font-bold text-white">Ready to meet your next great hire?</h2>
        <p className="text-emerald-100">Post your first job free. No credit card needed.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/jobs/new" className={`${buttonGold} px-6 py-3`}>Post a job free</Link>
          <Link href="mailto:support@readytowork.ph" className="inline-flex items-center rounded-lg border border-emerald-700 px-6 py-3 text-sm font-semibold text-white hover:border-amber-400">Still have questions? Email us</Link>
        </div>
      </section>
    </div>
  );
}
