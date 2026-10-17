'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api, useApi, type Worker } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Field, ErrorText, input, button, card } from '@/components/ui';
import { Select, JOB_TYPES } from '@/components/Select';
import { ResumeCard } from '@/components/ResumeCard';
import { PhotoCard } from '@/components/PhotoCard';

export default function ProfilePage() {
  const { user, ready } = useAuth();
  const { data } = useApi<Worker>(user?.role === 'worker' ? `/workers/${user.id}` : null);

  if (ready && user?.role !== 'worker') return <p>Only worker accounts have a profile.</p>;
  if (!data) return <p className="text-slate-500">Loading…</p>;
  return (
    <div className="mx-auto grid max-w-5xl items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <ProfileForm initial={data} />
      <div className="space-y-6 lg:sticky lg:top-24">
        <PhotoCard />
        <ResumeCard />
      </div>
    </div>
  );
}

function ProfileForm({ initial }: { initial: Worker }) {
  const [form, setForm] = useState({
    title: initial.title, bio: initial.bio, skills: initial.skills.join(', '),
    hourly_rate: initial.hourly_rate ?? '', availability: initial.availability,
    portfolio_url: initial.portfolio_url ?? '', linkedin_url: initial.linkedin_url ?? '',
  });
  const [msg, setMsg] = useState({ ok: '', error: '' });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/profile', { method: 'PUT', body: form });
      setMsg({ ok: 'Profile saved', error: '' });
    } catch (err) {
      setMsg({ ok: '', error: (err as Error).message });
    }
  }

  return (
    <form onSubmit={save} className={`${card} space-y-4`}>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your profile</h1>
        <Link href={`/workers/${initial.id}`} className="text-sm text-emerald-700">Preview your profile</Link>
      </div>
      <p className="text-sm text-slate-500">Add a title so employers can find you in search.</p>
      <Field label="Professional title"><input className={input} required placeholder="Virtual Assistant" value={form.title} onChange={set('title')} /></Field>
      <Field label="About you"><textarea className={input} rows={6} value={form.bio} onChange={set('bio')} /></Field>
      <Field label="Skills (comma separated)"><input className={input} value={form.skills} onChange={set('skills')} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Hourly rate (USD)"><input className={input} type="number" min="0" step="0.5" value={form.hourly_rate} onChange={set('hourly_rate')} /></Field>
        <Field label="Availability">
          <Select label="Availability" value={form.availability} onChange={(availability) => setForm({ ...form, availability })} options={JOB_TYPES} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Sample work / portfolio (optional)">
          <input className={input} inputMode="url" autoComplete="url" placeholder="yoursite.com or a Google Drive link" value={form.portfolio_url} onChange={set('portfolio_url')} />
        </Field>
        <Field label="LinkedIn profile (optional)">
          <input className={input} inputMode="url" placeholder="linkedin.com/in/your-name" value={form.linkedin_url} onChange={set('linkedin_url')} />
        </Field>
      </div>
      <ErrorText msg={msg.error} />
      {msg.ok && <p className="text-sm text-green-700">{msg.ok}</p>}
      <button className={button}>Save profile</button>
    </form>
  );
}
