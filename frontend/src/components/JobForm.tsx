'use client';
import Link from 'next/link';
import { useState } from 'react';
import { salary, useApi, PAY_PERIODS, type Job, type SalaryPeriod } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Field, ErrorText, input, button, buttonGhost, card } from '@/components/ui';
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

// How many applicants each plan lets an employer see per job (null = all), as the backend's PLAN_LIMITS.
const PLAN_SEES = { free: 20, pro: 100, premium: null } as const;
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
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-4">
          {step > 0 ? <button type="button" onClick={() => setStep(step - 1)} className={buttonGhost}>‹ Back</button> : <span />}
          {last
            ? <button className={button} disabled={status.busy || !jobDone}>{status.busy ? 'Saving…' : submitLabel}</button>
            : <button className={button} disabled={!jobDone}>Next ›</button>}
        </div>
      </form>
    </div>
  );
}

// Step 3: up to how many applications the job takes before it closes itself. Employers see applicants
// first come, first served up to their plan's limit, so a bar shows how many they'll view and how many
// wait for an upgrade (kept, never lost).
function ApplicationLimit({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { user } = useAuth();
  const { data: settings } = useApi<{ max_job_applications: number }>('/settings');
  const most = settings?.max_job_applications ?? 250;
  const plan = user?.plan ?? 'free';
  const sees = PLAN_SEES[plan];
  const limit = value ? Number(value) : most;
  const presets = [{ v: '20', label: '20' }, { v: '50', label: '50' }, { v: '100', label: '100' }, { v: '', label: `As many as possible (${most})` }];
  const custom = !presets.some((p) => p.v === value);
  const visible = sees === null ? limit : Math.min(sees, limit);
  const locked = limit - visible;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Up to how many applications do you want to receive?</h2>
        <p className="mt-0.5 text-sm text-slate-500">When your job reaches this number, it stops taking applications on its own. You can change it later.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Most applications">
        {presets.map((p) => {
          const on = p.v === value;
          return (
            <button key={p.label} type="button" role="radio" aria-checked={on} onClick={() => onChange(p.v)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${on ? 'border-emerald-950 bg-emerald-950 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-600'}`}>
              {p.label}
            </button>
          );
        })}
        <label className={`flex items-center gap-2 rounded-full border py-1 pl-4 pr-1 text-sm transition ${custom && value ? 'border-emerald-950' : 'border-slate-200'}`}>
          <span className="text-slate-500">Other</span>
          <input type="number" min={1} max={most} inputMode="numeric" value={custom ? value : ''} placeholder="30" aria-label="Other number"
            onChange={(e) => onChange(e.target.value === '' ? '' : String(Math.min(most, Math.max(1, Math.trunc(Number(e.target.value))))))}
            className="w-16 rounded-full bg-slate-50 px-2 py-1 text-center font-semibold outline-none focus:bg-emerald-50" />
        </label>
      </div>

      {/* What the employer will be able to view, first come, first served. */}
      <div className="space-y-2 rounded-xl bg-slate-50 p-4">
        <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
          <span className="bg-emerald-600" style={{ width: `${(visible / limit) * 100}%` }} />
          {locked > 0 && <span className="bg-[repeating-linear-gradient(45deg,#fcd34d_0_6px,#fef3c7_6px_12px)]" style={{ width: `${(locked / limit) * 100}%` }} />}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
          <span className="font-semibold text-emerald-800">You can view the first {visible} who apply</span>
          {locked > 0 && <span className="font-semibold text-amber-800">{locked} more saved for when you upgrade</span>}
        </div>
        {locked > 0 && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-200 pt-2 text-xs text-slate-600">
            The {PLAN_NAME[plan]} plan shows the first {sees} people to apply. Nobody is lost: upgrade any time to see the rest.
            <Link href="/pricing" className="font-semibold text-amber-800 underline underline-offset-2 hover:text-amber-900">
              {plan === 'free' ? 'Upgrade to Pro to see 100' : 'Upgrade to Premium to see all'}
            </Link>
            <button type="button" onClick={() => onChange(String(sees))} className="font-semibold text-slate-700 underline underline-offset-2 hover:text-slate-900">Set it to {sees}</button>
          </p>
        )}
      </div>
    </div>
  );
}
