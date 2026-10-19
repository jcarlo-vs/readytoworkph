'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useApi, type Worker } from '@/lib/api';
import { Skills, ErrorText, Initials, PageBand, input, card } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { EmployerGate } from '@/components/EmployerGate';
import { Select } from '@/components/Select';
import { MaskedText, Pager, SaveButton, lastActive, rateLine } from '@/components/Talent';

const AVAILABILITY: [string, string][] = [['', 'Any'], ['full-time', 'Full-time'], ['part-time', 'Part-time'], ['gig', 'Gigs']];
const ACTIVE: [string, string][] = [['', 'Any time'], ['1', 'Last 24 hours'], ['7', 'This week'], ['30', 'This month']];
const SORTS = [
  { value: '', label: 'Recently active' },
  { value: 'rate', label: 'Lowest rate' },
  { value: 'newest', label: 'Newest members' },
];

// Hire Talent: search plus filters (skills, availability, rate, last active), sort, 20 per page, and a
// Saved list. The URL holds the search, so links, refreshes and the back button keep it.
export default function WorkersPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, ready } = useAuth();
  const employer = user?.role === 'employer';
  const get = (k: string) => params.get(k) ?? '';
  const saved = get('view') === 'saved';

  const setParams = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) if (v) next.set(k, v); else next.delete(k);
    if (!('page' in changes)) next.delete('page'); // a new search starts on page 1
    router.replace(`/workers${next.size ? `?${next}` : ''}`, { scroll: false });
  };

  // Typed fields update the search once typing pauses; they follow the URL when it changes elsewhere.
  const fromUrl = () => ({ q: get('q'), rate_min: get('rate_min'), rate_max: get('rate_max') });
  const [draft, setDraft] = useState(fromUrl);
  const [synced, setSynced] = useState(params.toString());
  if (synced !== params.toString()) { setSynced(params.toString()); setDraft(fromUrl()); }
  useEffect(() => {
    const changed = Object.entries(draft).filter(([k, v]) => v !== (params.get(k) ?? ''));
    if (!changed.length) return;
    const t = setTimeout(() => setParams(Object.fromEntries(changed)), 400);
    return () => clearTimeout(t);
  });

  const skills = get('skills').split(',').filter(Boolean);
  const [skillDraft, setSkillDraft] = useState('');
  const addSkill = () => {
    const s = skillDraft.trim().toLowerCase();
    if (s && !skills.includes(s)) setParams({ skills: [...skills, s].join(',') });
    setSkillDraft('');
  };

  const search = new URLSearchParams(params); search.delete('view');
  const { data: found, error } = useApi<{ workers: Worker[]; total: number; page_size: number }>(employer && !saved ? `/workers?${search}` : null);
  const { data: savedList, error: savedError } = useApi<Worker[]>(employer && saved ? '/saved' : null);
  const workers = saved ? savedList : found?.workers;
  const page = Number(get('page')) || 0;
  const filtered = ['q', 'skills', 'availability', 'rate_min', 'rate_max', 'active'].some((k) => params.get(k));

  if (ready && !employer) return <EmployerGate signedIn={!!user} />;
  const seg = (on: boolean) => `rounded-full px-3.5 py-1.5 font-medium transition ${on ? 'bg-white text-slate-900 shadow-sm' : 'text-emerald-100 hover:text-white'}`;
  return (
    <div className="space-y-6">
      <PageBand title="Hire Filipino talent" sub="Browse skilled remote professionals ready to join your team."
        actions={<div className="inline-flex rounded-full bg-white/10 p-1 text-sm ring-1 ring-white/10" role="group" aria-label="Show">
          <button type="button" className={seg(!saved)} aria-pressed={!saved} onClick={() => setParams({ view: '' })}>All talent</button>
          <button type="button" className={seg(saved)} aria-pressed={saved} onClick={() => setParams({ view: 'saved' })}>★ Saved{savedList ? ` (${savedList.length})` : ''}</button>
        </div>} />

      <div className={`grid gap-6 ${saved ? '' : 'lg:grid-cols-[16rem_minmax(0,1fr)]'}`}>
        {!saved && (
          <aside className={`${card} h-fit space-y-5 p-5`} aria-label="Filters">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">Filters</h2>
              {filtered && <button type="button" onClick={() => router.replace('/workers', { scroll: false })} className="text-sm font-medium text-emerald-700 hover:underline">Clear all</button>}
            </div>
            <div className="space-y-2">
              <label htmlFor="skill-add" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Skills</label>
              <input id="skill-add" className={input} placeholder="Add a skill, press Enter" value={skillDraft}
                onChange={(e) => setSkillDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSkill(); } }} onBlur={addSkill} />
              {skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {skills.map((s) => (
                    <button key={s} type="button" onClick={() => setParams({ skills: skills.filter((x) => x !== s).join(',') })}
                      className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100" aria-label={`Remove ${s}`}>
                      {s} ×
                    </button>
                  ))}
                </div>
              )}
            </div>
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">Availability</legend>
              <div className="grid grid-cols-2 gap-1.5">
                {AVAILABILITY.map(([v, label]) => (
                  <button key={label} type="button" onClick={() => setParams({ availability: v })} aria-pressed={get('availability') === v}
                    className={`rounded-lg border px-2 py-1.5 text-sm font-medium transition ${get('availability') === v ? 'border-emerald-700 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>{label}</button>
                ))}
              </div>
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hourly rate (USD)</legend>
              <div className="flex items-center gap-2">
                <input className={`${input} text-center`} type="number" min="0" inputMode="decimal" placeholder="Min" aria-label="Minimum hourly rate" value={draft.rate_min} onChange={(e) => setDraft({ ...draft, rate_min: e.target.value })} />
                <span className="text-slate-400">-</span>
                <input className={`${input} text-center`} type="number" min="0" inputMode="decimal" placeholder="Max" aria-label="Maximum hourly rate" value={draft.rate_max} onChange={(e) => setDraft({ ...draft, rate_max: e.target.value })} />
              </div>
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last active</legend>
              <div className="grid grid-cols-2 gap-1.5">
                {ACTIVE.map(([v, label]) => (
                  <button key={label} type="button" onClick={() => setParams({ active: v })} aria-pressed={get('active') === v}
                    className={`rounded-lg border px-2 py-1.5 text-sm font-medium transition ${get('active') === v ? 'border-emerald-700 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>{label}</button>
                ))}
              </div>
            </fieldset>
          </aside>
        )}

        <div className="min-w-0 space-y-4">
          {!saved && (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 shadow-sm focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/20">
                <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400"><circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="m13.5 13.5 3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                <input value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} placeholder="Role, skill or keyword (e.g. bookkeeper)" aria-label="Search workers"
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none" />
              </label>
              <Select label="Sort" className="w-48" value={get('sort')} onChange={(v) => setParams({ sort: v })} options={SORTS} />
            </div>
          )}
          <p className="text-sm text-slate-500">
            {saved ? (savedList ? `${savedList.length} saved worker${savedList.length === 1 ? '' : 's'}` : ' ')
              : found ? `${found.total.toLocaleString('en-US')} worker${found.total === 1 ? '' : 's'}${filtered ? ' match' : ''}` : 'Searching…'}
          </p>
          <ErrorText msg={saved ? savedError : error} />

          <ul className="space-y-3">
            {workers?.map((w) => {
              const rate = rateLine(w.hourly_rate);
              return (
                <li key={w.id}>
                  {/* The name's link stretches over the whole card; Save and the blurred chips sit above it. */}
                  <div className={`${card} relative flex flex-col gap-4 p-5 transition hover:border-emerald-600 hover:shadow-md sm:flex-row`}>
                    <Initials name={w.name} id={w.id} size="h-16 w-16 text-lg" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="font-semibold text-slate-900">
                            <Link href={`/workers/${w.id}`} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-emerald-600">{w.name}</Link>
                          </h2>
                          <p className="text-slate-700"><MaskedText text={w.title} /></p>
                        </div>
                        <span className="relative z-10"><SaveButton workerId={w.id} saved={w.saved} compact /></span>
                      </div>
                      <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600">
                        <span className="capitalize">{w.availability}</span>
                        {rate && <span><strong className="text-emerald-700">{rate.hourly}</strong></span>}
                        <span className="text-slate-500">{lastActive(w.last_seen_at)}</span>
                      </p>
                      <p className="line-clamp-2 text-sm text-slate-500"><MaskedText text={w.bio} /></p>
                      <Skills skills={w.skills.slice(0, 6)} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {workers?.length === 0 && (
            <div className={`${card} space-y-2 p-8 text-center`}>
              <p className="font-medium text-slate-800">{saved ? 'No saved workers yet' : 'No workers match'}</p>
              <p className="text-sm text-slate-500">{saved ? 'Tap ☆ Save on anyone you like and they’ll be here.' : 'Try fewer filters or a broader keyword.'}</p>
            </div>
          )}
          {!saved && found && <Pager page={page} total={found.total} size={found.page_size} onPage={(p) => { setParams({ page: p ? String(p) : '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} noun="workers" />}
        </div>
      </div>
    </div>
  );
}
