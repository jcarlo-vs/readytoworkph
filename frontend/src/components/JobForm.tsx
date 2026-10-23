'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { salary, useApi, PAY_PERIODS, type Job, type SalaryPeriod } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Field, ErrorText, input, button, buttonGhost, buttonGold, card } from '@/components/ui';
import { Select, JOB_TYPES } from '@/components/Select';

export type JobInput = {
  title: string; description: string; skills: string; job_type: string;
  salary_min: string; salary_max: string; salary_period: SalaryPeriod;
  max_applications: string; // '' = as many as the site allows
};

const toInput = (j?: Job): JobInput => ({
  title: j?.title ?? '', description: j?.description ?? '', skills: j?.skills.join(', ') ?? '',
  job_type: j?.job_type ?? 'full-time', salary_period: j?.salary_period ?? 'month',
  salary_min: j?.salary_min != null ? String(Number(j.salary_min)) : '',
  salary_max: j?.salary_max != null ? String(Number(j.salary_max)) : '',
  max_applications: j?.max_applications != null ? String(j.max_applications) : '',
});

// Most applications one job takes on each plan (null = the site-wide most), as the backend's PLAN_LIMITS.
const PLAN_CAP = { free: 20, pro: 100, premium: null } as const;
const PLAN_NAME = { free: 'Free', pro: 'Pro', premium: 'Premium' } as const;
const STEPS = ['The job', 'Type and pay', 'Applicants'] as const;

// Same limits as the backend (JOB_TITLE_MAX / JOB_DESCRIPTION_MAX). Typing or pasting past them isn't
// cut off silently: the field turns red and says by how much, and the form won't submit until it fits.
const TITLE_MAX = 120;
const DESCRIPTION_MAX = 10_000;
const n = (v: number) => v.toLocaleString('en-US');
// The live count under a field: always for short fields, from 80% for long ones, red once over.
function Limit({ id, length, max, always = false }: { id: string; length: number; max: number; always?: boolean }) {
  const over = length - max;
  if (over > 0) {
    return <p id={id} role="alert" className="mt-1 text-xs font-semibold text-red-600">Too long by {n(over)} character{over === 1 ? '' : 's'} ({n(length)} / {n(max)}). Please shorten it.</p>;
  }
  if (!always && length < max * 0.8) return null;
  return <p id={id} className={`mt-1 text-right text-xs ${length === max ? 'font-semibold text-amber-700' : 'text-slate-500'}`}>{n(length)} / {n(max)} characters</p>;
}
const overStyle = (over: boolean) => (over ? ' border-red-500 focus:border-red-500 focus:ring-red-500/20' : '');

// Post a job, or edit one (`job` given), in three steps: the job, type and pay, then how many applications
// to receive. `notice` shows above the final button, e.g. a note about existing applicants.
export function JobForm({ job, heading, submitLabel, notice, onSubmit }: {
  job?: Job; heading: string; submitLabel: string; notice?: React.ReactNode; onSubmit: (form: JobInput) => Promise<void>;
}) {
  const [form, setForm] = useState(() => toInput(job));
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState({ busy: false, error: '' });
  const set = (k: keyof JobInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const titleOver = form.title.length > TITLE_MAX;
  const descriptionOver = form.description.length > DESCRIPTION_MAX;
  const jobDone = !!form.title.trim() && !!form.description.trim() && !titleOver && !descriptionOver;
  const last = step === STEPS.length - 1;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!last) { setStep(step + 1); return; } // Enter in a field moves on rather than posting early
    setStatus({ busy: true, error: '' });
    try {
      await onSubmit(form);
    } catch (err) {
      setStatus({ busy: false, error: (err as Error).message });
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-center text-2xl font-bold">{heading}</h1>
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map((name, i) => (
          <li key={name}>
            <button type="button" onClick={() => setStep(i)} disabled={i > 0 && !jobDone} aria-current={i === step ? 'step' : undefined}
              className="flex w-full flex-col gap-1.5 text-left disabled:cursor-not-allowed">
              <span className={`h-1 rounded-full ${i < step ? 'bg-emerald-600' : i === step ? 'bg-emerald-950' : 'bg-slate-200'}`} />
              <span className={`text-xs font-semibold ${i === step ? 'text-slate-900' : i < step ? 'text-emerald-800' : 'text-slate-400'}`}>{i < step ? '✓ ' : ''}{i + 1} · {name}</span>
            </button>
          </li>
        ))}
      </ol>

      <form onSubmit={submit} className={`${card} space-y-4`}>
        {step === 0 && (
          <>
            <Field label="Job title">
              <input className={input + overStyle(titleOver)} required value={form.title} onChange={set('title')} autoFocus
                aria-invalid={titleOver} aria-describedby="title-limit" />
              <Limit id="title-limit" length={form.title.length} max={TITLE_MAX} always />
            </Field>
            <Field label="Description">
              <textarea className={input + overStyle(descriptionOver)} rows={8} required value={form.description} onChange={set('description')}
                aria-invalid={descriptionOver} aria-describedby="description-limit" />
              <Limit id="description-limit" length={form.description.length} max={DESCRIPTION_MAX} />
              <p className="mt-1.5 flex gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                <span aria-hidden="true">💡</span>
                <span>Tip: applicants can message you right here on ReadyToWork.ph. If you add an email, phone number or link, only signed-in members see it; visitors are asked to sign up first.</span>
              </p>
            </Field>
            <Field label="Skills (comma separated)"><input className={input} placeholder="react, seo, customer service" value={form.skills} onChange={set('skills')} /></Field>
          </>
        )}

        {step === 1 && (
          <>
            <Field label="Type">
              <Select label="Type" value={form.job_type} onChange={(job_type) => setForm({ ...form, job_type })} options={JOB_TYPES} />
            </Field>
            <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4">
              <legend className="px-1 text-sm font-medium text-slate-700">Pay (USD, optional)</legend>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Pay is">
                  <Select label="Pay period" value={form.salary_period} onChange={(v) => setForm({ ...form, salary_period: v as SalaryPeriod })} options={PAY_PERIODS} />
                </Field>
                <Field label={form.salary_period === 'fixed' ? 'Min budget' : 'Min'}><input className={input} type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={form.salary_min} onChange={set('salary_min')} /></Field>
                <Field label={form.salary_period === 'fixed' ? 'Max budget' : 'Max'}><input className={input} type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={form.salary_max} onChange={set('salary_max')} /></Field>
              </div>
              <p className="text-sm text-slate-500">Workers will see: <strong className="text-emerald-900">{salary(form)}</strong></p>
            </fieldset>
          </>
        )}

        {last && <ApplicationLimit value={form.max_applications} onChange={(max_applications) => setForm({ ...form, max_applications })} />}

        {last && notice}
        <ErrorText msg={status.error} />
        {/* Same height and width for both (the primary gets a clear border to match the outlined one). */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
          {step > 0
            ? <button type="button" onClick={() => setStep(step - 1)} className={`${buttonGhost} h-11 min-w-28 gap-1.5 pl-4`}><Chevron back />Back</button>
            : <span />}
          {last
            ? <button className={`${button} h-11 min-w-28 border border-transparent`} disabled={status.busy || !jobDone}>{status.busy ? 'Saving…' : submitLabel}</button>
            : <button className={`${button} h-11 min-w-28 gap-1.5 border border-transparent pr-4`} disabled={!jobDone}>Next<Chevron /></button>}
        </div>
      </form>
    </div>
  );
}

// Step 3: up to how many applications the job takes before it closes itself. Each plan has a ceiling
// (Free 20, Pro 100, Premium the site-wide most), drawn true to scale on one bar; going past yours snaps back
// and says which plan unlocks more. The API refuses anything above the plan too.
function ApplicationLimit({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { user } = useAuth();
  const { data: settings } = useApi<{ max_job_applications: number }>('/settings');
  const most = settings?.max_job_applications ?? 250;
  const plan = user?.plan ?? 'free';
  const capOf = (p: keyof typeof PLAN_CAP) => Math.min(most, PLAN_CAP[p] ?? most);
  const cap = capOf(plan);
  const current = value ? Math.min(Number(value), cap) : cap; // empty = the most the plan allows
  const [over, setOver] = useState(false);
  // A job saved earlier above today's plan ceiling comes down to it, or saving would be refused.
  useEffect(() => { if (value && Number(value) > cap) onChange(String(cap)); }, [value, cap, onChange]);

  const set = (v: number) => {
    const next = Math.max(1, Math.min(most, Math.round(v)));
    setOver(next > cap);
    onChange(String(Math.min(next, cap)));
  };
  const zones = (['free', 'pro', 'premium'] as const).map((p, i, all) => ({
    p, max: capOf(p), from: i ? capOf(all[i - 1]) : 0, locked: capOf(p) > cap,
  }));
  const pct = (v: number) => `${(v / most) * 100}%`;
  const step = 'flex size-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-xl font-semibold text-emerald-950 transition hover:bg-slate-50 disabled:opacity-40';

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Up to how many applications do you want?</h2>
        <p className="mt-0.5 text-sm text-slate-500">Your job stops taking applications when it reaches this number. You can change it later.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={step} onClick={() => set(current - 1)} disabled={current <= 1} aria-label="Fewer">−</button>
        <span className="min-w-20 text-center font-display text-4xl font-extrabold leading-none text-emerald-950" aria-live="polite">{current}</span>
        <button type="button" className={step} onClick={() => set(current + 1)} aria-label="More">+</button>
        <span className="text-sm text-slate-500">applications, then your job closes</span>
      </div>

      <div>
        {/* Where each plan ends, on the same 1-to-most scale as the bar. */}
        <div className="relative mx-3.5 h-5 text-xs font-semibold" aria-hidden="true">
          {zones.map((z) => (
            <span key={z.p} style={{ left: pct(z.max) }}
              className={`absolute bottom-0.5 flex items-center gap-1 whitespace-nowrap ${z.p === 'premium' ? '-translate-x-full' : '-translate-x-1/2'} ${z.locked ? 'text-slate-500' : 'text-emerald-700'}`}>
              {z.locked && <Lock />}{PLAN_NAME[z.p]} {z.max}
            </span>
          ))}
        </div>
        <div className="relative h-11">
          <div className="absolute inset-x-3.5 top-3.5 flex h-4 overflow-hidden rounded-full" aria-hidden="true">
            {zones.map((z) => (
              <span key={z.p} style={{ flex: `${z.max - z.from} 0 0` }}
                className={`${z.p !== 'free' ? 'border-l-2 border-white' : ''} ${z.locked ? 'bg-[repeating-linear-gradient(135deg,#e2e8f0_0_6px,#f1f5f9_6px_12px)]' : 'bg-emerald-100'}`} />
            ))}
          </div>
          <span className="absolute left-3.5 top-3.5 h-4 rounded-full bg-emerald-700" style={{ width: `calc((100% - 28px) * ${current / most})` }} aria-hidden="true" />
          <input type="range" min={1} max={most} value={current} onChange={(e) => set(Number(e.target.value))}
            aria-label="Most applications" aria-valuetext={`${current} applications`}
            className="absolute inset-0 h-11 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none
              [&::-moz-range-thumb]:size-[22px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-emerald-950 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow
              [&::-webkit-slider-thumb]:size-7 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-emerald-950 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow
              focus-visible:[&::-webkit-slider-thumb]:ring-4 focus-visible:[&::-webkit-slider-thumb]:ring-emerald-300 focus-visible:[&::-moz-range-thumb]:ring-4 focus-visible:[&::-moz-range-thumb]:ring-emerald-300" />
        </div>
      </div>

      {over && plan !== 'premium' ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-950">
            <b>The {PLAN_NAME[plan]} plan accepts up to {cap} applications.</b><br />
            {plan === 'free' ? `Upgrade to Pro to accept up to ${capOf('pro')}, or Premium for up to ${most}.` : `Upgrade to Premium to accept up to ${most}.`}
          </p>
          <Link href="/pricing" className={buttonGold}>Upgrade to {plan === 'free' ? 'Pro' : 'Premium'}</Link>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          {plan === 'premium' ? `Premium accepts up to ${cap} applications per job.` : `Your ${PLAN_NAME[plan]} plan accepts up to ${cap}. The grey part unlocks when you upgrade.`}
        </p>
      )}
    </div>
  );
}

const Lock = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

const Chevron = ({ back = false }: { back?: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={back ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
  </svg>
);
