'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useApi } from '@/lib/api';
import { button, buttonGhost, buttonGold } from '@/components/ui';

// Features starting with NOT are shown crossed out, as what the plan doesn't include.
const NOT = '✗ ';

type Plan = {
  name: string; monthly: number; blurb: string; popular?: boolean; features: string[]; cta: [string, string];
};
const PLANS: Plan[] = [
  {
    name: 'Free', monthly: 0, blurb: 'For trying RemotePinas and occasional hiring.',
    features: ['Up to 3 job posts per month', 'Up to 20 applications per job', 'View job applications', 'Reply to your applicants', '10 AI applicant analyses per month', 'Applicants sorted by interest (Credits)', NOT + 'Reach out to workers first'],
    cta: ['Post a job free', '/jobs/new'],
  },
  {
    name: 'Pro', monthly: 19, blurb: 'For growing teams hiring every month.', popular: true,
    features: ['Up to 5 job posts per month', 'Up to 250 applications per job', 'View job applications', 'Reach out to any worker first', '500 AI applicant analyses per month', 'AI reads resumes, cover letters and profiles'],
    cta: ['Get Pro', 'mailto:hello@remotepinas.com?subject=Upgrade%20to%20Pro'],
  },
  {
    name: 'Premium', monthly: 49, blurb: 'For agencies and high-volume hiring.',
    features: ['Up to 10 job posts per month', 'Up to 300 applications per job', 'View job applications', 'Reach out to any worker first', 'Unlimited AI applicant analyses', 'Score all applicants in one click, not one by one', 'Your own hiring analytics dashboard', 'Priority support'],
    cta: ['Get Premium', 'mailto:hello@remotepinas.com?subject=Upgrade%20to%20Premium'],
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
    ['What does the Free plan include?', 'You can post up to 3 jobs a month, receive up to 20 applications per job, read every application and reply to the people who applied. It’s enough to see the quality of talent before you pay anything.'],
    ['Why can’t I message workers first on the Free plan?', 'Free accounts that could message anyone would quickly attract spammers and fake “job offers”, and workers would stop trusting messages. Keeping outreach to paid plans protects workers, keeps quality high, and keeps RemotePinas running.'],
    ['Why pay a subscription instead of a fee per hire?', 'Agencies and many freelance sites add a markup on every hour you pay, for as long as the person works for you. We charge a simple monthly price instead, so once you hire someone, every peso of their pay goes to them.'],
    ['Monthly or yearly?', `Yearly costs the same as ${YEARLY_MONTHS} months, so you get 2 months free. It suits teams that hire regularly.`],
    ['Can I switch plans later?', 'Yes. You can move from Free to Pro or Premium, from Pro to Premium, or from monthly to yearly whenever you need more.'],
    ['Do limits reset?', 'Yes. Job posts and AI analyses reset on the 1st of every month.'],
    ['What happens when a job reaches its application limit?', 'It stops accepting new applications and workers see that it’s full. Upgrade to receive more applications on your jobs.'],
    ['What does an AI analysis do?', 'It scores one applicant from 0 to 100 against your job post, and lists their strengths and concerns. Re-opening a result is free.'],
  ]],
  ['Cancelling', [
    ['Do I have to stay subscribed after I hire someone?', 'No. There are no contracts or minimum terms. Many employers subscribe while hiring and cancel once their team is set. You keep your job history and your conversations.'],
    ['How do I cancel?', 'Once online checkout launches, you’ll cancel from your account in a couple of clicks. Until then, email hello@remotepinas.com and we’ll take care of it.'],
    ['Do I get a refund if I cancel?', 'Payments aren’t refunded, but nothing is cut short: you keep your plan until the end of the period you paid for, then move back to Free.'],
  ]],
  ['Hiring and trust', [
    ['How do I pay the people I hire?', 'Directly, using whatever you both agree on, such as Wise, PayPal or a bank transfer. RemotePinas isn’t involved in salaries and never takes a cut.'],
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

// ponytail: pricing page only; no checkout yet, so paid plans go to email.
export default function PricingPage() {
  const [yearly, setYearly] = useState(false);
  const { data: stats } = useApi<{ upgraded_this_month: number }>('/stats');
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
              className={`relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm ${p.popular ? 'border-emerald-950 ring-2 ring-emerald-950 md:-my-3 md:py-9' : 'border-slate-200'}`}>
              {p.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-slate-900">Most popular</span>}
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
              <Link href={p.monthly ? `${p.cta[1]}${yearly ? '%20(yearly)' : ''}` : p.cta[1]}
                className={`${p.popular ? buttonGold : p.monthly ? button : buttonGhost} mt-8 w-full py-3`}>{p.cta[0]}</Link>
              <p className="mt-2 h-4 text-center text-xs text-slate-500">{p.monthly ? 'Cancel anytime' : 'No credit card needed'}</p>
            </section>
          ))}
        </div>
        <p className="text-center text-sm text-slate-500">Prices in USD. Online checkout is coming soon. For now, email us and we&apos;ll upgrade your account.</p>
      </div>

      <section className="space-y-6">
        <h2 className="text-center font-display text-2xl font-bold tracking-tight">Why employers choose RemotePinas</h2>
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

      <section className="space-y-4 rounded-3xl bg-emerald-950 px-6 py-10 text-center">
        <h2 className="font-display text-2xl font-bold text-white">Ready to meet your next great hire?</h2>
        <p className="text-emerald-100">Post your first job free. No credit card needed.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/jobs/new" className={`${buttonGold} px-6 py-3`}>Post a job free</Link>
          <Link href="mailto:hello@remotepinas.com" className="inline-flex items-center rounded-lg border border-emerald-700 px-6 py-3 text-sm font-semibold text-white hover:border-amber-400">Still have questions? Email us</Link>
        </div>
      </section>
    </div>
  );
}
