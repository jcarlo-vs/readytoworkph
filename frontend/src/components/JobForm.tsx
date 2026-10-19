'use client';
import { useState } from 'react';
import { salary, PAY_PERIODS, type Job, type SalaryPeriod } from '@/lib/api';
import { Field, ErrorText, input, button, card } from '@/components/ui';
import { Select, JOB_TYPES } from '@/components/Select';

export type JobInput = {
  title: string; description: string; skills: string; job_type: string;
  salary_min: string; salary_max: string; salary_period: SalaryPeriod;
};

const toInput = (j?: Job): JobInput => ({
  title: j?.title ?? '', description: j?.description ?? '', skills: j?.skills.join(', ') ?? '',
  job_type: j?.job_type ?? 'full-time', salary_period: j?.salary_period ?? 'month',
  salary_min: j?.salary_min != null ? String(Number(j.salary_min)) : '',
  salary_max: j?.salary_max != null ? String(Number(j.salary_max)) : '',
});

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

// Post a job, or edit one (`job` given). `notice` shows above the submit button, e.g. a note about existing applicants.
export function JobForm({ job, heading, submitLabel, notice, onSubmit }: {
  job?: Job; heading: string; submitLabel: string; notice?: React.ReactNode; onSubmit: (form: JobInput) => Promise<void>;
}) {
  const [form, setForm] = useState(() => toInput(job));
  const [status, setStatus] = useState({ busy: false, error: '' });
  const set = (k: keyof JobInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const titleOver = form.title.length > TITLE_MAX;
  const descriptionOver = form.description.length > DESCRIPTION_MAX;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ busy: true, error: '' });
    try {
      await onSubmit(form);
    } catch (err) {
      setStatus({ busy: false, error: (err as Error).message });
    }
  }

  return (
    <form onSubmit={submit} className={`${card} mx-auto max-w-2xl space-y-4`}>
      <h1 className="text-2xl font-bold">{heading}</h1>
      <Field label="Job title">
        <input className={input + overStyle(titleOver)} required value={form.title} onChange={set('title')}
          aria-invalid={titleOver} aria-describedby="title-limit" />
        <Limit id="title-limit" length={form.title.length} max={TITLE_MAX} always />
      </Field>
      <Field label="Description">
        <textarea className={input + overStyle(descriptionOver)} rows={8} required value={form.description} onChange={set('description')}
          aria-invalid={descriptionOver} aria-describedby="description-limit" />
        <Limit id="description-limit" length={form.description.length} max={DESCRIPTION_MAX} />
      </Field>
      <Field label="Skills (comma separated)"><input className={input} placeholder="react, seo, customer service" value={form.skills} onChange={set('skills')} /></Field>
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
      {notice}
      <ErrorText msg={status.error} />
      <button className={button} disabled={status.busy || titleOver || descriptionOver}>{status.busy ? 'Saving…' : submitLabel}</button>
    </form>
  );
}
