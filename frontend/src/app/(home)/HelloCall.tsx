// The "Hello Call" homepage hero: a worker on a video call, with two little chat bubbles floating on the photo.
// The admin picks this design and its photo in Settings (homepage_design, homepage_photo).
export const HOME_PHOTOS = {
  laughing: {
    label: 'Laughing on a call', src: '/home/laughing.jpg', position: '72% 35%',
    alt: 'A Filipina in glasses laughing during a video call at her home desk',
    badge: 'Interview in progress', initials: 'KR',
    message: ['Kate from San Diego', '“Okay, you’re hilarious. You’re hired.”'],
    result: ['Hired: Virtual Assistant', 'Full-time · paid in USD'],
  },
  good_news: {
    label: 'Good news', src: '/home/good-news.jpg', position: '50% 40%',
    alt: 'A Filipina laughing on the phone next to her laptop',
    badge: 'Good news call', initials: 'OL',
    message: ['Olivia from Melbourne', '“We’d love to have you on the team!”'],
    result: ['Offer accepted: Executive VA', 'Starts Monday · paid in USD'],
  },
} as const;
export type HomePhoto = keyof typeof HOME_PHOTOS;

const chip = 'absolute flex max-w-64 items-center gap-2.5 rounded-2xl bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.55)] animate-float motion-reduce:animate-none';

// `children` is the search box (and site numbers) from the homepage.
export function HelloCallHero({ photo, children }: { photo: HomePhoto; children: React.ReactNode }) {
  const p = HOME_PHOTOS[photo] ?? HOME_PHOTOS.laughing;
  return (
    <section className="overflow-hidden bg-emerald-950">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:py-20 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-7">
          <p className="inline-block rounded-full bg-amber-400/15 px-3 py-1 text-sm font-medium text-amber-200 ring-1 ring-amber-300/30">
            Remote jobs from overseas employers
          </p>
          <h1 className="font-display text-4xl font-extrabold leading-[1.02] tracking-[-0.03em] text-white text-balance sm:text-6xl">
            Your next client is <span className="text-amber-300">one call</span> away.
          </h1>
          <p className="max-w-xl text-lg text-emerald-50/90">
            Filipino virtual assistants, developers, designers and marketers get hired here for full-time remote work. Employers post a job in five minutes.
          </p>
          {children}
        </div>
        <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
          {/* eslint-disable-next-line @next/next/no-img-element -- a fixed, pre-sized photo from /public; no image optimizer on Workers */}
          <img src={p.src} alt={p.alt} fetchPriority="high" style={{ objectPosition: p.position }}
            className="aspect-[4/4.3] w-full rounded-[28px] object-cover" />
          <span className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">
            <i className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />{p.badge}
          </span>
          {/* The bubbles are an illustration, not real messages, so screen readers skip them. */}
          <div aria-hidden="true">
            <div className={`${chip} left-3 top-6 lg:-left-7`}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-950">{p.initials}</span>
              <div>{p.message[0]}<small className="block text-xs text-slate-500">{p.message[1]}</small></div>
            </div>
            <div className={`${chip} bottom-8 right-3 [animation-delay:3s] lg:-right-5`}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-400 font-bold text-slate-900">✓</span>
              <div>{p.result[0]}<small className="block text-xs text-slate-500">{p.result[1]}</small></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
