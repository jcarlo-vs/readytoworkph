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

// Post a job, or edit one (`job` given). `notice` shows above the submit button, e.g. a note about existing applicants.
export function JobForm({ job, heading, submitLabel, notice, onSubmit }: {
  job?: Job; heading: string; submitLabel: string; notice?: React.ReactNode; onSubmit: (form: JobInput) => Promise<void>;
}) {
  const [form, setForm] = useState(() => toInput(job));
  const [status, setStatus] = useState({ busy: false, error: '' });
  const set = (k: keyof JobInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

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
      <Field label="Job title"><input className={input} required value={form.title} onChange={set('title')} /></Field>
      <Field label="Description"><textarea className={input} rows={8} required value={form.description} onChange={set('description')} /></Field>
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
      <button className={button} disabled={status.busy}>{status.busy ? 'Saving…' : submitLabel}</button>
    </form>
  );
}
