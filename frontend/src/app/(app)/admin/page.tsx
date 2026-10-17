'use client';
import { useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { ErrorText, Field, button, card, input } from '@/components/ui';

type Settings = { topups_enabled: boolean; daily_applications: number; free_ai_analyses: number };

// The admin panel has its own login and token, separate from worker/employer accounts.
async function adminApi<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let token: string | null = null;
  try { token = localStorage.getItem('adminToken'); } catch { /* storage unavailable */ }
  const res = await fetch(`${API}/admin${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (res.status === 401 && path !== '/login') {
    try { localStorage.removeItem('adminToken'); } catch { /* storage unavailable */ }
  }
  if (!res.ok) throw Object.assign(new Error(data.error ?? 'Request failed'), { status: res.status });
  return data;
}

export default function AdminPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    adminApi<Settings>('/settings').then(setSettings, () => setNeedsLogin(true));
  }, []);

  if (needsLogin) return <AdminLogin onDone={(s) => { setSettings(s); setNeedsLogin(false); }} />;
  if (!settings) return <p className="text-slate-500">Loading…</p>;
  return <SettingsForm initial={settings} onLogout={() => { try { localStorage.removeItem('adminToken'); } catch { /* */ } setNeedsLogin(true); }} />;
}

function AdminLogin({ onDone }: { onDone: (s: Settings) => void }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [status, setStatus] = useState({ busy: false, error: '' });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ busy: true, error: '' });
    try {
      const { token } = await adminApi<{ token: string }>('/login', 'POST', form);
      try { localStorage.setItem('adminToken', token); } catch { /* storage unavailable */ }
      onDone(await adminApi<Settings>('/settings'));
    } catch (err) {
      setStatus({ busy: false, error: (err as Error).message });
    }
  }
  return (
    <form onSubmit={submit} className={`${card} mx-auto max-w-sm space-y-4`}>
      <h1 className="text-xl font-bold">Admin login</h1>
      <Field label="Email"><input className={input} type="email" required autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
      <Field label="Password"><input className={input} type="password" required autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
      <ErrorText msg={status.error} />
      <button className={`${button} w-full`} disabled={status.busy}>{status.busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-emerald-700' : 'bg-slate-300'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-5.5' : 'left-0.5'}`} />
    </button>
  );
}

function SettingsForm({ initial, onLogout }: { initial: Settings; onLogout: () => void }) {
  const [form, setForm] = useState(initial);
  const [msg, setMsg] = useState({ ok: '', error: '' });
  const row = 'flex items-center justify-between gap-6 py-4';

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      setForm(await adminApi<Settings>('/settings', 'PUT', form));
      setMsg({ ok: 'Settings saved. They apply right away.', error: '' });
    } catch (err) {
      if ((err as { status?: number }).status === 401) return onLogout();
      setMsg({ ok: '', error: (err as Error).message });
    }
  }
  const num = (k: 'daily_applications' | 'free_ai_analyses') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: Math.trunc(Number(e.target.value)) });

  return (
    <form onSubmit={save} className={`${card} mx-auto max-w-2xl space-y-2`}>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin settings</h1>
        <button type="button" onClick={onLogout} className="text-sm font-medium text-slate-500 hover:text-slate-800">Log out</button>
      </div>
      <div className="divide-y divide-slate-100">
        <div className={row}>
          <div>
            <p className="font-medium text-slate-900">Credit top-ups</p>
            <p className="text-sm text-slate-500">Show &quot;Top up&quot; buttons and the top-up window to workers. Free daily credits work either way.</p>
          </div>
          <Toggle label="Credit top-ups" checked={form.topups_enabled} onChange={(topups_enabled) => setForm({ ...form, topups_enabled })} />
        </div>
        <div className={row}>
          <div>
            <p className="font-medium text-slate-900">Applications per worker per day</p>
            <p className="text-sm text-slate-500">Stops spam, since 0-credit applications are free. From 1 to 500.</p>
          </div>
          <div className="w-24 shrink-0"><input className={`${input} text-center`} type="number" min={1} max={500} required value={form.daily_applications} onChange={num('daily_applications')} /></div>
        </div>
        <div className={row}>
          <div>
            <p className="font-medium text-slate-900">Free AI analyses per employer</p>
            <p className="text-sm text-slate-500">How many applicant analyses a free employer gets. From 0 to 1,000.</p>
          </div>
          <div className="w-24 shrink-0"><input className={`${input} text-center`} type="number" min={0} max={1000} required value={form.free_ai_analyses} onChange={num('free_ai_analyses')} /></div>
        </div>
      </div>
      <ErrorText msg={msg.error} />
      {msg.ok && <p className="text-sm text-green-700">{msg.ok}</p>}
      <button className={button}>Save settings</button>
    </form>
  );
}
