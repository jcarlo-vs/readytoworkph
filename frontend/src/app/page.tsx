'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { button, buttonGold, buttonGhost, SearchLabel } from '@/components/ui';

const CATEGORIES = [
  'Virtual Assistant', 'Customer Service', 'Bookkeeping', 'Social Media Manager', 'Graphic Design',
  'Web Development', 'React', 'WordPress', 'SEO', 'Content Writing', 'Video Editing', 'Data Entry',
  'Shopify', 'Lead Generation', 'Project Manager', 'Email Marketing', 'Copywriting', 'UI/UX Design',
  'Amazon VA', 'Real Estate VA', 'Medical VA', 'Technical Support', 'QA Testing', 'Mobile Development',
];

const STEPS = [
  ['Post a job', 'Describe the role, skills and budget. It takes about five minutes.'],
  ['Search talent', 'Browse profiles by skill and availability, or let candidates come to you.'],
  ['Interview', 'Review applications and cover letters, then reach out to your shortlist.'],
  ['Hire directly', 'Agree on terms with your new team member and start working together.'],
];

const REASONS = [
  ['English proficiency', 'English is an official language, widely used in business and education.'],
  ['Time zone coverage', 'Teams are used to supporting US, UK and Australian business hours.'],
  ['Service culture', 'A deep talent pool from the country’s large customer-support and outsourcing sector.'],
  ['Cost effective', 'Hire full-time, dedicated professionals at rates that fit growing businesses.'],
];

function Stats() {
  const { data } = useApi<{ jobs: number; workers: number; employers: number }>('/stats');
  // ponytail: hidden until numbers look credible; lower the threshold or drop it once traffic grows
  if (!data || data.jobs + data.workers < 20) return null;
  return (
    <dl className="flex flex-wrap gap-x-10 gap-y-4">
      {([['Jobs posted', data.jobs], ['Professionals', data.workers], ['Employers', data.employers]] as const).map(([label, n]) => (
        <div key={label}>
          <dt className="text-sm text-emerald-100/80">{label}</dt>
          <dd className="text-3xl font-bold text-white">{n.toLocaleString()}</dd>
        </div>
      ))}
    </dl>
  );
}

function HeroSearch() {
  const router = useRouter();
  const { user } = useAuth();
  const [picked, setPicked] = useState<'hire' | 'work'>('hire');
  // Logged-in users search their own side; visitors choose with the tabs.
  const mode = user ? (user.role === 'employer' ? 'hire' : 'work') : picked;
  const [q, setQ] = useState('');
  const [searching, startSearch] = useTransition();
  const tab = (m: typeof mode, label: string) => (
    <button type="button" onClick={() => setPicked(m)} aria-pressed={mode === m}
      className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold transition ${mode === m ? 'bg-white text-emerald-800 shadow' : 'text-emerald-50 hover:bg-white/10'}`}>
      {label}
    </button>
  );
  return (
    <div className="max-w-xl rounded-2xl bg-white/10 p-2 ring-1 ring-white/20 backdrop-blur">
      {user
        ? <p className="mb-2 px-2 pt-1 text-sm font-semibold text-emerald-50">{mode === 'hire' ? 'Search Filipino talent' : 'Search remote jobs'}</p>
        : <div className="mb-2 flex gap-1">{tab('hire', 'I want to hire')}{tab('work', 'I want to work')}</div>}
      <form className="flex gap-2"
        onSubmit={(e) => { e.preventDefault(); startSearch(() => router.push(`/${mode === 'hire' ? 'workers' : 'jobs'}?q=${encodeURIComponent(q)}`)); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search"
          placeholder={mode === 'hire' ? 'e.g. virtual assistant, web developer' : 'e.g. customer service, bookkeeping'}
          className="min-w-0 flex-1 rounded-lg border-0 bg-white px-4 py-3 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
        <button className={`${buttonGold} px-6`} disabled={searching}><SearchLabel pending={searching} /></button>
      </form>
    </div>
  );
}

// ponytail: hand-simplified island outlines (decorative); swap for an accurate open-data outline if it ever needs to be a real map
const ISLANDS = [
  'M82.8 20L93.6 18 111.6 20 113.4 44 111.6 60 100.8 74 100.8 94 108 106 126 114 140.4 126 147.6 138 131.4 132 118.8 120 108 112 99 116 88.2 114 82.8 102 79.2 92 72 80 68.4 66 77.4 58 79.2 40Z',
  'M79.2 120L93.6 122 99 138 93.6 146 86.4 142 77.4 126Z',
  'M63 162L68.4 172 50.4 192 28.8 218 21.6 222 27 212 46.8 188 59.4 170Z',
  'M108 152L127.8 160 118.8 178 106.2 180 106.2 158Z',
  'M126 172L135 178 131.4 198 127.8 209 118.8 198 123.3 184Z',
  'M144 165L145.8 182 135 200 133.2 194 140.4 178Z',
  'M142.2 188L154.8 190 151.2 198 140.4 196Z',
  'M149.4 158L162 166 165.6 186 158.4 188 149.4 170Z',
  'M149.4 140L167.4 144 174.6 168 162 166 154.8 158 147.6 148Z',
  'M129.6 142L142.2 146 135 152Z',
  'M108 252L113.4 238 126 230 136.8 218 149.4 222 158.4 212 171 194 181.8 210 189 238 183.6 262 174.6 270 165.6 278 151.2 270 145.8 258 144 244 135 236 124.2 242Z',
];

// [name, x, y, label side] on the map's 200x300 viewBox (roughly 19px per degree of longitude, 20.5px per degree of latitude from Manila).
// Manila's pin is a little bigger than the rest.
const CITIES: [string, number, number, 'left' | 'right', number?][] = [
  ['Baguio', 82, 63, 'left'],
  ['Manila', 90, 100, 'right', 0.5],
  ['Iloilo', 120, 180, 'left'],
  ['Cebu', 145, 188, 'right'],
  ['Cagayan de Oro', 159, 225, 'left'],
  ['Davao', 172, 256, 'left'],
];

function PhilippinesPin() {
  return (
    <svg viewBox="0 0 200 300" aria-hidden="true"
      className="pointer-events-none absolute right-4 top-1/2 hidden h-[30rem] w-80 -translate-y-1/2 xl:block">
      <g fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.28)" strokeWidth="0.8" strokeLinejoin="round">
        {ISLANDS.map((d) => <path key={d} d={d} />)}
        <circle cx="92" cy="268" r="2.6" />
        <circle cx="83" cy="276" r="2.2" />
        <circle cx="100" cy="262" r="2" />
      </g>
      {/* The tip of each pin sits on its city. */}
      {CITIES.map(([name, x, y, side, size = 0.36]) => (
        <g key={name}>
          <ellipse cx={x} cy={y} rx={size * 17} ry={size * 5.5} fill="none" stroke="#fbbf24" strokeOpacity="0.45" strokeWidth="1" />
          <g transform={`translate(${x - 32 * size} ${y - 61 * size}) scale(${size})`}>
            <path d="M32 3C19.3 3 9 13 9 25.5 9 42 32 61 32 61S55 42 55 25.5C55 13 44.7 3 32 3Z" fill="#fbbf24" fillOpacity="0.9" />
            <circle cx="32" cy="25" r="9" fill="#022c22" />
          </g>
          <text x={side === 'right' ? x + size * 25 : x - size * 25} y={y - size * 14} textAnchor={side === 'right' ? 'start' : 'end'} fontSize="7" fontWeight="600" fill="#ffffff" fillOpacity="0.7">{name}</text>
        </g>
      ))}
    </svg>
  );
}

export default function Home() {
  return (
    <>
      <section className="relative overflow-hidden bg-emerald-950">
        <div className="relative mx-auto max-w-6xl space-y-8 px-4 py-20 sm:py-28">
          <PhilippinesPin />
          <p className="inline-block rounded-full bg-amber-400/15 px-3 py-1 text-sm font-medium text-amber-200 ring-1 ring-amber-300/30">
            Built for remote teams and Filipino professionals
          </p>
          <h1 className="max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-6xl">
            Hire great Filipino talent. <span className="text-amber-300">Grow without borders.</span>
          </h1>
          <p className="max-w-2xl text-lg text-emerald-50/90">
            Find skilled virtual assistants, developers, designers and marketers ready to work full-time for your business, or find your next remote job.
          </p>
          <HeroSearch />
          <Stats />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight">How RemotePinas works</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-slate-600">From job post to new hire in four simple steps.</p>
        <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-400 font-bold text-slate-900">{i + 1}</span>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-slate-600">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-white py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-3xl font-bold tracking-tight">Find talent for any role</h2>
          <p className="mt-2 max-w-2xl text-slate-600">From admin support to software engineering. Create a free employer account to browse professionals by skill.</p>
          <div className="mt-8 flex flex-wrap gap-2.5">
            {CATEGORIES.map((c) => (
              <Link key={c} href={`/workers?q=${encodeURIComponent(c)}`}
                className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-emerald-600 hover:bg-emerald-50 hover:text-emerald-800">
                {c}
              </Link>
            ))}
          </div>
          <Link href="/register" className={`${button} mt-8`}>Sign up to browse talent →</Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="grid items-start gap-12 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Why hire from the Philippines?</h2>
            <p className="mt-3 text-slate-600">
              The Philippines is one of the world’s leading destinations for remote work, with millions of professionals experienced in supporting international businesses.
            </p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {REASONS.map(([title, text]) => (
              <li key={title} className="rounded-xl border-l-4 border-amber-400 bg-white p-5 shadow-sm">
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-slate-600">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 md:grid-cols-2">
        <div className="rounded-2xl bg-emerald-950 p-8 text-white">
          <h2 className="text-2xl font-bold">For employers</h2>
          <p className="mt-2 text-emerald-50/90">Post your first job and start receiving applications from qualified Filipino professionals.</p>
          <Link href="/register" className={`${buttonGold} mt-6`}>Start hiring</Link>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-8">
          <h2 className="text-2xl font-bold">For job seekers</h2>
          <p className="mt-2 text-slate-600">Create a free profile, showcase your skills and apply to remote jobs from around the world.</p>
          <Link href="/register" className={`${buttonGhost} mt-6`}>Create your profile</Link>
        </div>
      </section>
    </>
  );
}
