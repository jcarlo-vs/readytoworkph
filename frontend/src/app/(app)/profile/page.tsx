'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api, useApi, type Worker } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Field, ErrorText, PageBand, input, button, buttonGhost, buttonGold, card } from '@/components/ui';
import { ENGLISH, SETUP, SKILL_SUGGESTIONS, START_WHEN, WORK_HOURS } from '@/lib/profile';
import { Select, JOB_TYPES } from '@/components/Select';
import { ResumeCard } from '@/components/ResumeCard';
import { PhotoCard } from '@/components/PhotoCard';

export default function ProfilePage() {
  const { user, ready } = useAuth();
  const { data } = useApi<Worker>(user?.role === 'worker' ? `/workers/${user.id}` : null);

  if (ready && !user) return <p><Link href="/login?next=/profile" className="text-emerald-700 underline">Log in</Link> to edit your profile.</p>;
  if (ready && user?.role !== 'worker') return <p className="text-slate-600">Employer accounts don&apos;t have a worker profile. <Link href="/dashboard" className="font-medium text-emerald-700 hover:underline">Go to My Jobs</Link></p>;
  if (!data) return <p className="text-slate-500">Loading…</p>;
  return <ProfileEditor initial={data} />;
}

type Form = {
  title: string; bio: string; skills: string[]; skill_years: Record<string, number>; hourly_rate: string; availability: string;
  portfolio_url: string; linkedin_url: string; location: string; work_hours: string; hours_per_week: string; start_when: string;
  english: string; languages: string; internet_mbps: string; setup: string[]; show_resume: boolean;
};

// Bento editor: one card per section, each saved on its own (it sends the whole profile, so nothing is lost).
// The band shows how many sections are filled in.
function ProfileEditor({ initial }: { initial: Worker }) {
  const [form, setForm] = useState<Form>({
    title: initial.title, bio: initial.bio, skills: initial.skills, skill_years: initial.skill_years ?? {},
    hourly_rate: initial.hourly_rate ?? '', availability: initial.availability,
    portfolio_url: initial.portfolio_url ?? '', linkedin_url: initial.linkedin_url ?? '',
    location: initial.location ?? '', work_hours: initial.work_hours ?? '', hours_per_week: initial.hours_per_week?.toString() ?? '',
    start_when: initial.start_when ?? '', english: initial.english ?? '', languages: initial.languages ?? '',
    internet_mbps: initial.internet_mbps?.toString() ?? '', setup: initial.setup ?? [], show_resume: initial.show_resume ?? true,
  });
  const [status, setStatus] = useState<Record<string, { busy?: boolean; ok?: boolean; error?: string }>>({});
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const text = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set({ [k]: e.target.value } as Partial<Form>);

  async function save(section: string) {
    setStatus((s) => ({ ...s, [section]: { busy: true } }));
    try {
      await api('/profile', { method: 'PUT', body: form });
      setStatus((s) => ({ ...s, [section]: { ok: true } }));
    } catch (err) {
      setStatus((s) => ({ ...s, [section]: { error: (err as Error).message } }));
    }
  }

  const sections = [
    ['Basics', !!form.title && form.bio.length >= 40 && !!form.location],
    ['Work & pay', !!form.hourly_rate && !!form.hours_per_week && !!form.start_when],
    ['Skills', form.skills.length >= 3 && form.skills.every((s) => form.skill_years[s] != null)],
    ['Work setup', !!form.internet_mbps || form.setup.length > 0],
    ['Languages', !!form.english],
  ] as const;
  const done = sections.filter(([, ok]) => ok).length;

  const Card = ({ id, title, wide = false, children }: { id: string; title: string; wide?: boolean; children: React.ReactNode }) => {
    const st = status[id] ?? {};
    const ok = sections.find(([t]) => t === title)?.[1];
    return (
      <section className={`${card} space-y-4 ${wide ? 'lg:col-span-2' : ''}`} aria-labelledby={`sec-${id}`}>
        <div className="flex items-center justify-between gap-2">
          <h2 id={`sec-${id}`} className="font-display text-lg font-bold">{title}</h2>
          {ok !== undefined && (ok
            ? <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-600 text-xs text-white" title="Done">✓</span>
            : <span className="h-6 w-6 rounded-full border-2 border-dashed border-slate-300" title="Not finished" />)}
        </div>
        {children}
        <div className="flex items-center justify-end gap-3">
          {st.ok && <span className="text-sm text-emerald-700">Saved ✓</span>}
          <button type="button" onClick={() => save(id)} disabled={st.busy} className={`${button} px-5 py-2`}>{st.busy ? 'Saving…' : 'Save'}</button>
        </div>
        <ErrorText msg={st.error ?? ''} />
      </section>
    );
  };
  const choose = (list: { value: string; label: string }[]) => [{ value: '', label: 'Not set' }, ...list];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageBand title="Your profile" sub={`${done} of ${sections.length} sections done · complete profiles get more messages and higher AI Fit Scores`}
        actions={<Link href={`/workers/${initial.id}`} className={buttonGold}>Preview profile</Link>}>
        <div className="h-2 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={sections.length} aria-label="Profile completeness">
          <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${(done / sections.length) * 100}%` }} />
        </div>
      </PageBand>

      <div className="grid grid-flow-dense items-start gap-6 lg:grid-cols-3">
        {Card({ id: 'basics', title: 'Basics', wide: true, children: <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Professional title"><input id="p-title" className={input} required placeholder="Virtual Assistant" value={form.title} onChange={text('title')} /></Field>
            <Field label="Location (city or province)"><input id="p-location" className={input} maxLength={80} placeholder="Cebu City, Cebu" value={form.location} onChange={text('location')} /></Field>
          </div>
          <Field label="About you">
            <textarea id="p-bio" className={input} rows={5} value={form.bio} onChange={text('bio')} placeholder="What you do best, who you’ve worked for, and the results you get." />
            <span className="mt-1 block text-xs text-slate-500">Don&apos;t add your email, phone or social links. Employers message you here, and contact details are hidden from most employers anyway.</span>
          </Field>
        </> })}
        <PhotoCard />

        {Card({ id: 'skills', title: 'Skills', wide: true, children: <SkillPicker form={form} set={set} /> })}
        <ResumeCard />

        {Card({ id: 'work', title: 'Work & pay', children: <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hourly rate (USD)"><input id="p-rate" className={input} type="number" min="0" step="0.5" value={form.hourly_rate} onChange={text('hourly_rate')} /></Field>
            <Field label="Hours per week"><input id="p-hours" className={input} type="number" min="1" max="80" placeholder="40" value={form.hours_per_week} onChange={text('hours_per_week')} /></Field>
          </div>
          <Field label="Looking for"><Select label="Looking for" value={form.availability} onChange={(availability) => set({ availability })} options={JOB_TYPES} /></Field>
          <Field label="Hours you can work"><Select label="Hours you can work" value={form.work_hours} onChange={(work_hours) => set({ work_hours })} options={choose(WORK_HOURS)} /></Field>
          <Field label="Can start"><Select label="Can start" value={form.start_when} onChange={(start_when) => set({ start_when })} options={choose(START_WHEN)} /></Field>
        </> })}
        {Card({ id: 'setup', title: 'Work setup', children: <>
          <Field label="Internet speed (Mbps)"><input id="p-mbps" className={input} type="number" min="1" max="10000" placeholder="50" value={form.internet_mbps} onChange={text('internet_mbps')} /></Field>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium text-slate-700">What you have</legend>
            {SETUP.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-emerald-700" checked={form.setup.includes(o.value)}
                  onChange={(e) => set({ setup: e.target.checked ? [...form.setup, o.value] : form.setup.filter((x) => x !== o.value) })} />
                {o.label}
              </label>
            ))}
          </fieldset>
        </> })}
        {Card({ id: 'languages', title: 'Languages', children: <>
          <Field label="English level"><Select label="English level" value={form.english} onChange={(english) => set({ english })} options={choose(ENGLISH)} /></Field>
          <Field label="Other languages"><input id="p-langs" className={input} maxLength={100} placeholder="Filipino, Cebuano" value={form.languages} onChange={text('languages')} /></Field>
        </> })}

        {Card({ id: 'links', title: 'Links & resume', wide: true, children: <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sample work / portfolio (optional)">
              <input id="p-portfolio" className={input} inputMode="url" autoComplete="url" placeholder="yoursite.com or a Google Drive link" value={form.portfolio_url} onChange={text('portfolio_url')} />
            </Field>
            <Field label="LinkedIn profile (optional)">
              <input id="p-linkedin" className={input} inputMode="url" placeholder="linkedin.com/in/your-name" value={form.linkedin_url} onChange={text('linkedin_url')} />
            </Field>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-emerald-700" checked={form.show_resume} onChange={(e) => set({ show_resume: e.target.checked })} />
            <span>Show a <b>Download CV</b> button on my profile <span className="block text-xs text-slate-500">Only employers who can message you can download it. Untick to share it only with jobs you apply to.</span></span>
          </label>
        </> })}
      </div>
    </div>
  );
}

const without = (o: Record<string, number>, key: string) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== key));

// Up to 10 skills, picked from suggestions (or typed), each with years of experience.
function SkillPicker({ form, set }: { form: Form; set: (p: Partial<Form>) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const s = draft.trim().toLowerCase().slice(0, 50);
    if (s && !form.skills.includes(s) && form.skills.length < 10) set({ skills: [...form.skills, s] });
    setDraft('');
  };
  const remove = (s: string) => {
    set({ skills: form.skills.filter((x) => x !== s), skill_years: without(form.skill_years, s) });
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input id="p-skill" className={input} list="skill-suggestions" placeholder={form.skills.length >= 10 ? 'You have 10 skills (the most)' : 'Type a skill, e.g. QuickBooks'}
          disabled={form.skills.length >= 10} value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }} />
        <button type="button" onClick={add} className={`${buttonGhost} shrink-0 px-4 py-2`}>Add</button>
        <datalist id="skill-suggestions">{SKILL_SUGGESTIONS.filter((s) => !form.skills.includes(s.toLowerCase())).map((s) => <option key={s} value={s} />)}</datalist>
      </div>
      {form.skills.length === 0 ? <p className="text-sm text-slate-500">Add at least 3 skills. Pick from the suggestions so employers searching for them find you.</p> : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {form.skills.map((s) => (
            <li key={s} className="flex items-center gap-2 rounded-xl bg-emerald-50/60 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium capitalize">{s}</span>
              <select aria-label={`Years of experience in ${s}`} className="rounded-lg border border-emerald-950/10 bg-white px-2 py-1 text-sm"
                value={form.skill_years[s] ?? ''} onChange={(e) => {
                  const rest = without(form.skill_years, s);
                  set({ skill_years: e.target.value === '' ? rest : { ...rest, [s]: Number(e.target.value) } });
                }}>
                <option value="">Years?</option>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 15, 20].map((y) => <option key={y} value={y}>{y === 0 ? 'Under 1 yr' : `${y} yr${y === 1 ? '' : 's'}`}</option>)}
              </select>
              <button type="button" onClick={() => remove(s)} aria-label={`Remove ${s}`} className="rounded-full px-2 text-slate-400 hover:bg-white hover:text-red-600">×</button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-500">{form.skills.length}/10 skills · years show as bars on your profile</p>
    </div>
  );
}
