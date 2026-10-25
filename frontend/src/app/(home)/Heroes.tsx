'use client';
// The three newer homepage heroes (Big Photo, Search First, Two Faces) and the two "door" cards they share.
// The admin picks one in Settings (homepage_design).
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { HOME_PHOTOS, type HomePhoto } from './HelloCall';

export const HOME_DESIGNS = ['classic', 'hello_call', 'big_photo', 'search_first', 'two_faces'] as const;
export type HomeDesign = typeof HOME_DESIGNS[number];

const svg = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
const h1 = 'font-display text-[2.6rem] font-extrabold leading-[1.02] tracking-[-0.03em] text-white text-balance sm:text-7xl';
const lead = 'text-lg text-emerald-100/80 sm:text-xl';
const free = <p className="text-sm text-emerald-100/70">Free to sign up. No agency, no hidden fees.</p>;

// Gold card for workers (most visitors), white card for employers. The card lifts and the arrow turns on hover.
function Doors() {
  const { user } = useAuth();
  const doors = [
    { href: '/jobs', tag: 'For workers', title: 'I’m looking for work', text: 'Full-time remote jobs from employers abroad. Always free.', go: 'Find jobs',
      card: 'bg-gradient-to-br from-[#ffd862] via-[#f5b81c] to-[#eaa50b] text-[#231800] shadow-[0_18px_40px_-18px_#f5b81c99] hover:shadow-[0_26px_50px_-16px_#f5b81ccc]',
      blob: 'bg-white/20', icon: 'bg-white/60 text-[#6b4700]', tagCls: 'bg-black/10', arrow: 'bg-[#231800] text-amber-400',
      path: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16' },
    { href: user?.role === 'employer' ? '/jobs/new' : '/register?role=employer', tag: 'For employers', title: 'I want to hire', text: 'Post a job in five minutes and meet Filipino talent.', go: 'Post a job',
      card: 'bg-white text-slate-900 shadow-[0_18px_40px_-20px_#000a] hover:shadow-[0_26px_50px_-16px_#6ee7b766]',
      blob: 'bg-emerald-100', icon: 'bg-emerald-950 text-amber-400', tagCls: 'bg-emerald-50 text-emerald-900', arrow: 'bg-emerald-900 text-white',
      path: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8' },
  ];
  return (
    <div className="grid max-w-xl gap-3.5 text-left sm:grid-cols-2">
      {doors.map((d) => (
        <Link key={d.tag} href={d.href}
          className={`group relative isolate flex min-h-52 flex-col gap-1.5 overflow-hidden rounded-3xl p-5 transition duration-300 hover:-translate-y-1.5 motion-reduce:transition-none ${d.card}`}>
          <span className={`absolute -bottom-16 -right-14 -z-10 h-44 w-44 rounded-full transition duration-500 group-hover:scale-125 ${d.blob}`} aria-hidden="true" />
          <span className="mb-auto flex items-center justify-between">
            <span className={`grid h-11 w-11 place-items-center rounded-2xl ${d.icon}`}><svg viewBox="0 0 24 24" className="h-6 w-6" {...svg}><path d={d.path} /></svg></span>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${d.tagCls}`}>{d.tag}</span>
          </span>
          <b className="mt-4 font-display text-[22px] font-extrabold leading-tight tracking-[-0.02em]">{d.title}</b>
          <span className="text-sm opacity-80">{d.text}</span>
          <span className="mt-3 flex items-center justify-between text-[15px] font-bold">
            {d.go}
            <span className={`grid h-9 w-9 place-items-center rounded-full transition duration-300 group-hover:translate-x-1 group-hover:-rotate-45 ${d.arrow}`}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" {...svg} strokeWidth={2.6}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

// The photo fills the hero; a green fade on the left (on top, on phones) keeps the words readable.
export function BigPhotoHero({ photo }: { photo: HomePhoto }) {
  const p = HOME_PHOTOS[photo] ?? HOME_PHOTOS.laughing;
  return (
    <section className="relative isolate overflow-hidden bg-emerald-950">
      {/* eslint-disable-next-line @next/next/no-img-element -- a fixed, pre-sized photo from /public; no image optimizer on Workers */}
      <img src={p.src} alt={p.alt} fetchPriority="high" style={{ objectPosition: p.position }}
        className="absolute inset-x-0 top-0 -z-20 h-96 w-full object-cover lg:inset-0 lg:h-full" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,#022c2200_0,#022c2200_12rem,#022c22_24rem)] lg:bg-[linear-gradient(90deg,#022c22_0%,#022c22f0_38%,#022c2299_62%,#022c2200_85%)]" />
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-80 lg:py-28">
        <div className="max-w-xl space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-sm text-emerald-100 ring-1 ring-white/15">
            <i className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_#34d39933]" aria-hidden="true" />New remote jobs every day
          </p>
          <h1 className={h1}>Remote work, <span className="text-amber-400">made simple.</span></h1>
          <p className={lead}>Filipino professionals find full-time jobs from home. Employers abroad find great people to hire.</p>
          <Doors />
          {free}
        </div>
      </div>
    </section>
  );
}

// Centered, with the job search first. `search` is the homepage search box.
export function SearchFirstHero({ search }: { search: React.ReactNode }) {
  return (
    <section className="bg-emerald-950 bg-[radial-gradient(900px_400px_at_50%_0,#065f46_0,#022c22_70%)]">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-20 text-center sm:py-24">
        <h1 className={`${h1} max-w-[16ch]`}>Find remote work, <span className="text-amber-400">made simple.</span></h1>
        <p className={`${lead} max-w-xl`}>Full-time jobs from employers abroad, for Filipino professionals working from home.</p>
        <div className="w-full max-w-xl text-left">{search}</div>
        <p className="mt-6 text-sm text-emerald-100/70">Or pick where you start</p>
        <Doors />
      </div>
    </section>
  );
}

const FACES: [HomePhoto, string, string][] = [
  ['laughing', 'Hired as a Virtual Assistant', 'left-0 top-10 -rotate-6'],
  ['good_news', 'Got the job offer 🎉', 'right-0 top-28 rotate-6'],
];

// Centered words with a worker photo tilted on each side (wide screens only).
export function TwoFacesHero() {
  return (
    <section className="overflow-hidden bg-emerald-950">
      <div className="relative mx-auto max-w-7xl px-4 py-20 sm:py-24">
        {FACES.map(([k, label, place]) => (
          <div key={k} aria-hidden="true" className={`absolute hidden w-56 overflow-hidden rounded-[28px] shadow-[0_30px_60px_-30px_#000c] xl:block ${place}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- decorative photo from /public */}
            <img src={HOME_PHOTOS[k].src} alt="" style={{ objectPosition: HOME_PHOTOS[k].position }} className="aspect-[3/4] w-full object-cover" />
            <span className="absolute bottom-3 left-3 rounded-xl bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900">{label}</span>
          </div>
        ))}
        <div className="relative mx-auto flex max-w-xl flex-col items-center gap-6 text-center">
          <h1 className={h1}>Remote work, <span className="text-amber-400">made simple.</span></h1>
          <p className={lead}>Filipino professionals find full-time jobs from home. Employers abroad find great people to hire.</p>
          <Doors />
          {free}
        </div>
      </div>
    </section>
  );
}
