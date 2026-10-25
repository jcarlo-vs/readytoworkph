'use client';
import { useEffect, useState } from 'react';
import { ErrorText, button, card, input } from '@/components/ui';
import { PageHeader, adminApi, failed, useAdmin } from '../ui';
import { HOME_PHOTOS, type HomePhoto } from '@/app/(home)/HelloCall';
import type { HomeDesign } from '@/app/(home)/Heroes';

type Settings = { topups_enabled: boolean; daily_applications: number; free_ai_analyses: number; free_full_names: boolean; max_job_applications: number;
  homepage_design: HomeDesign; homepage_photo: HomePhoto };

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

// A choice tile: a little picture of the option, its name and a line about it.
function Choice({ on, onPick, title, hint, children }: { on: boolean; onPick: () => void; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onPick}
      className={`overflow-hidden rounded-xl border-2 bg-white text-left transition ${on ? 'border-emerald-700 ring-4 ring-emerald-700/15' : 'border-slate-200 hover:border-slate-300'}`}>
      {children}
      <span className="flex items-start justify-between gap-2 px-3 py-2.5">
        <span><span className="block text-sm font-semibold text-slate-900">{title}</span>{hint && <span className="block text-xs text-slate-500">{hint}</span>}</span>
        <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-emerald-700' : 'border-slate-300'}`}>{on && <span className="h-2 w-2 rounded-full bg-emerald-700" />}</span>
      </span>
    </button>
  );
}

// A tiny drawing of each homepage hero: the headline and search box as bars, then the map or the photo.
function HeroSketch({ photo }: { photo?: string }) {
  return (
    <span className="flex aspect-[16/8] items-center gap-3 bg-emerald-950 px-4">
      <span className="flex-1 space-y-1.5">
        <span className="block h-1.5 w-1/3 rounded-full bg-amber-300/50" />
        <span className="block h-2.5 w-11/12 rounded-full bg-white/90" />
        <span className="block h-2.5 w-2/3 rounded-full bg-amber-300" />
        <span className="block h-1.5 w-4/5 rounded-full bg-white/30" />
        <span className="mt-2 flex h-4 w-4/5 items-center justify-end rounded-md bg-white/90 pr-0.5"><span className="h-3 w-6 rounded bg-amber-400" /></span>
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element -- a small preview of the photo in /public */}
      {photo ? <img src={photo} alt="" className="h-[80%] w-[38%] rounded-lg object-cover" />
        : <svg viewBox="0 0 40 60" className="h-[75%] w-[30%] text-white/20" fill="currentColor" aria-hidden="true"><path d="M14 2l8-1 2 12-4 8 8 6-4 2-8-6-4-8zM8 34l4 2-8 12-2-1zM22 38l12 2 4 10-6 8-8-4-4-8z" /><circle cx="15" cy="14" r="2" fill="#fbbf24" /><circle cx="30" cy="46" r="2" fill="#fbbf24" /></svg>}
    </span>
  );
}

// Sketches of the newer heroes: a headline, then two little cards (gold for workers, white for employers).
const bars = (center = false) => (
  <span className={`flex flex-col gap-1.5 ${center ? 'items-center' : ''}`}>
    <span className="block h-2.5 w-24 rounded-full bg-white/90" />
    <span className="block h-2.5 w-16 rounded-full bg-amber-300" />
  </span>
);
const minis = <span className="flex gap-1.5"><span className="h-7 w-12 rounded-md bg-amber-400" /><span className="h-7 w-12 rounded-md bg-white" /></span>;
function NewSketch({ kind, photo }: { kind: 'big_photo' | 'search_first' | 'two_faces'; photo: string }) {
  /* eslint-disable @next/next/no-img-element -- small previews of the photos in /public */
  if (kind === 'big_photo') return (
    <span className="relative flex aspect-[16/8] flex-col justify-center gap-2.5 overflow-hidden bg-emerald-950 px-4">
      <img src={photo} alt="" className="absolute inset-y-0 right-0 h-full w-2/3 object-cover" />
      <span className="absolute inset-0 bg-[linear-gradient(90deg,#022c22_35%,#022c2200_90%)]" />
      <span className="relative space-y-2.5">{bars()}{minis}</span>
    </span>
  );
  if (kind === 'search_first') return (
    <span className="flex aspect-[16/8] flex-col items-center justify-center gap-2 bg-emerald-950 px-4">
      {bars(true)}
      <span className="flex h-4 w-3/4 items-center justify-end rounded-full bg-white/90 pr-0.5"><span className="h-3 w-7 rounded-full bg-amber-400" /></span>
      {minis}
    </span>
  );
  return (
    <span className="relative flex aspect-[16/8] flex-col items-center justify-center gap-2.5 overflow-hidden bg-emerald-950 px-4">
      <img src={HOME_PHOTOS.laughing.src} alt="" className="absolute left-2 top-3 h-14 w-10 -rotate-6 rounded-md object-cover" />
      <img src={HOME_PHOTOS.good_news.src} alt="" className="absolute right-2 top-7 h-14 w-10 rotate-6 rounded-md object-cover" />
      {bars(true)}{minis}
    </span>
  );
  /* eslint-enable @next/next/no-img-element */
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
  const num = (k: 'daily_applications' | 'free_ai_analyses' | 'max_job_applications') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: Math.trunc(Number(e.target.value)) });
  const changed = JSON.stringify(form) !== JSON.stringify(saved);

  return (
    <form onSubmit={save} className="max-w-3xl space-y-6">
      <PageHeader title="Settings" sub="Changes apply as soon as you save" />
      <section className={`${card} space-y-4`}>
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Homepage</h2>
          <a href="/" target="_blank" className="text-sm font-semibold text-emerald-700 hover:underline">View homepage ↗</a>
        </div>
        <div>
          <p className="font-medium text-slate-900">Design</p>
          <p className="text-sm text-slate-500">The top of the homepage, the first thing visitors see. The rest of the page stays the same; every design except Classic uses the newer sections below it.</p>
        </div>
        <div role="radiogroup" aria-label="Homepage design" className="grid gap-3 sm:grid-cols-2">
          <Choice on={form.homepage_design === 'classic'} onPick={() => setForm({ ...form, homepage_design: 'classic' })}
            title="Classic" hint="Headline and search, with the Philippines map"><HeroSketch /></Choice>
          <Choice on={form.homepage_design === 'hello_call'} onPick={() => setForm({ ...form, homepage_design: 'hello_call' })}
            title="Hello Call" hint="A worker on a video call, with chat bubbles"><HeroSketch photo={HOME_PHOTOS[form.homepage_photo].src} /></Choice>
          {([['big_photo', 'Big Photo', 'The photo fills the top, with the two cards on it'],
            ['search_first', 'Search First', 'Centered, the job search comes first'],
            ['two_faces', 'Two Faces', 'Centered, with a photo tilted on each side']] as const).map(([k, title, hint]) => (
            <Choice key={k} on={form.homepage_design === k} onPick={() => setForm({ ...form, homepage_design: k })} title={title} hint={hint}>
              <NewSketch kind={k} photo={HOME_PHOTOS[form.homepage_photo].src} />
            </Choice>
          ))}
        </div>
        {(form.homepage_design === 'hello_call' || form.homepage_design === 'big_photo') && (
          <div className="space-y-3 rounded-xl bg-slate-50 p-4">
            <div>
              <p className="font-medium text-slate-900">Photo</p>
              <p className="text-sm text-slate-500">Used by Hello Call and Big Photo. On Hello Call, the chat bubbles change to match.</p>
            </div>
            <div role="radiogroup" aria-label="Homepage photo" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(Object.keys(HOME_PHOTOS) as HomePhoto[]).map((k) => (
                <Choice key={k} on={form.homepage_photo === k} onPick={() => setForm({ ...form, homepage_photo: k })} title={HOME_PHOTOS[k].label} hint={HOME_PHOTOS[k].message[1]}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a small preview of the photo in /public */}
                  <img src={HOME_PHOTOS[k].src} alt="" style={{ objectPosition: HOME_PHOTOS[k].position }} className="aspect-[4/3] w-full object-cover" />
                </Choice>
              ))}
            </div>
          </div>
        )}
      </section>
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
        <div className="divide-y divide-slate-100">
        <Row title="Show full names on Free" hint="Off: Free employers see “Maria S.” until the worker applies or they upgrade. Links and contact details stay hidden either way.">
          <Toggle label="Show full names on Free" checked={form.free_full_names} onChange={(free_full_names) => setForm({ ...form, free_full_names })} />
        </Row>
        <Row title="Smart Scores per month on Free" hint="Pro gets 500 and Premium is unlimited (10,000 fair use). From 0 to 1,000.">
          <div className="w-24 shrink-0"><input className={`${input} text-center`} type="number" min={0} max={1000} required aria-label="Free Smart Scores per month" value={form.free_ai_analyses} onChange={num('free_ai_analyses')} /></div>
        </Row>
        <Row title="Most applications per job" hint="A job closes itself when it gets this many, on every plan, and can't be reopened. Free sees the first 20 to apply, Pro the first 100, Premium all. From 10 to 5,000.">
          <div className="w-24 shrink-0"><input className={`${input} text-center`} type="number" min={10} max={5000} required aria-label="Most applications per job" value={form.max_job_applications} onChange={num('max_job_applications')} /></div>
        </Row>
        </div>
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
