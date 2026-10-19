'use client';
import { useEffect, useState } from 'react';
import { ErrorText, button, card, input } from '@/components/ui';
import { PageHeader, adminApi, failed, useAdmin } from '../ui';

type Settings = { topups_enabled: boolean; daily_applications: number; free_ai_analyses: number };

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-emerald-700' : 'bg-slate-300'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-5.5' : 'left-0.5'}`} />
    </button>
  );
}

function Row({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-4 first:pt-0 last:pb-0">
      <div><p className="font-medium text-slate-900">{title}</p><p className="text-sm text-slate-500">{hint}</p></div>
      {children}
    </div>
  );
}

// Site settings, grouped by who they affect. They apply as soon as they're saved.
export default function SettingsPage() {
  const { logout } = useAdmin();
  const [form, setForm] = useState<Settings | null>(null);
  const [saved, setSaved] = useState<Settings | null>(null);
  const [msg, setMsg] = useState({ ok: '', error: '' });
  useEffect(() => { adminApi<Settings>('/settings').then((s) => { setForm(s); setSaved(s); }, failed(logout, (error) => setMsg({ ok: '', error }))); }, [logout]);
  if (!form) return msg.error ? <ErrorText msg={msg.error} /> : <p className="text-slate-500">Loading settings…</p>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const s = await adminApi<Settings>('/settings', 'PUT', form);
      setForm(s); setSaved(s);
      setMsg({ ok: 'Saved. The changes apply right away.', error: '' });
    } catch (err) {
      failed(logout, (error) => setMsg({ ok: '', error }))(err as Error);
    }
  }
  const num = (k: 'daily_applications' | 'free_ai_analyses') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: Math.trunc(Number(e.target.value)) });
  const changed = JSON.stringify(form) !== JSON.stringify(saved);

  return (
    <form onSubmit={save} className="max-w-3xl space-y-6">
      <PageHeader title="Settings" sub="Changes apply as soon as you save" />
      <section className={`${card} space-y-3`}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Workers</h2>
        <div className="divide-y divide-slate-100">
          <Row title="Credit top-ups" hint="Show “Top up” buttons and the top-up window to workers. Free daily Credits work either way.">
            <Toggle label="Credit top-ups" checked={form.topups_enabled} onChange={(topups_enabled) => setForm({ ...form, topups_enabled })} />
          </Row>
          <Row title="Applications per worker per day" hint="Stops spam, since 0-credit applications are free. From 1 to 500.">
            <div className="w-24 shrink-0"><input className={`${input} text-center`} type="number" min={1} max={500} required aria-label="Applications per worker per day" value={form.daily_applications} onChange={num('daily_applications')} /></div>
          </Row>
        </div>
      </section>
      <section className={`${card} space-y-3`}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Employers</h2>
        <Row title="AI fit scores per month on Free" hint="Pro gets 500 and Premium is unlimited (10,000 fair use). From 0 to 1,000.">
          <div className="w-24 shrink-0"><input className={`${input} text-center`} type="number" min={0} max={1000} required aria-label="Free AI fit scores per month" value={form.free_ai_analyses} onChange={num('free_ai_analyses')} /></div>
        </Row>
      </section>
      <ErrorText msg={msg.error} />
      {msg.ok && !changed && <p className="text-sm font-medium text-emerald-700" role="status">{msg.ok}</p>}
      <div className="flex gap-2">
        <button className={`${button} disabled:opacity-50`} disabled={!changed}>Save settings</button>
        {changed && <button type="button" onClick={() => setForm(saved)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Discard changes</button>}
      </div>
    </form>
  );
}
