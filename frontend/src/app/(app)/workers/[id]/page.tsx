'use client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useApi, type Worker } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Skills, ErrorText, Initials, BackButton, button, card } from '@/components/ui';
import { EmployerGate } from '@/components/EmployerGate';
import { JOB_TYPES } from '@/components/Select';

export default function WorkerPage() {
  const { id } = useParams<{ id: string }>();
  const { user, ready } = useAuth();
  const allowed = user?.role === 'employer' || user?.id === Number(id); // workers can preview their own profile
  const { data: w, error } = useApi<Worker>(allowed ? `/workers/${id}` : null);

  if (ready && !allowed) return <EmployerGate signedIn={!!user} />;
  if (error) return <ErrorText msg={error} />;
  if (!w) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-6">
    <BackButton href="/workers">All talent</BackButton>
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-6">
        <div className={`${card} flex flex-wrap items-center gap-5`}>
          <Initials name={w.name} id={w.id} size="h-20 w-20 text-2xl" />
          <div>
            <h1 className="text-2xl font-bold">{w.name}</h1>
            <p className="text-lg text-slate-600">{w.title || 'No title yet'}</p>
          </div>
        </div>
        <section className={card}>
          <h2 className="mb-3 font-semibold">About</h2>
          <p className="whitespace-pre-line text-slate-700">{w.bio || 'This professional hasn’t written a bio yet.'}</p>
        </section>
      </div>
      <aside className={`${card} h-fit space-y-5`}>
        {user?.role === 'employer' && (
          <Link href={`/messages?with=${w.id}`} className={`${button} w-full`}>Message {w.name.split(' ')[0]}</Link>
        )}
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Availability</h2>
          <p className="mt-1 font-medium">{JOB_TYPES.find((t) => t.value === w.availability)?.label ?? w.availability}</p>
        </div>
        {w.hourly_rate && (
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rate</h2>
            <p className="mt-1 text-xl font-bold text-emerald-700">${w.hourly_rate}/hr</p>
          </div>
        )}
        {w.skills.length > 0 && (
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Skills</h2>
            <Skills skills={w.skills} />
          </div>
        )}
        {(w.portfolio_url || w.linkedin_url) && (
          <div className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Links</h2>
            {/* Worker-supplied links: open in a new tab, no referrer, no SEO credit. */}
            {[[w.portfolio_url, 'Sample work / portfolio'], [w.linkedin_url, 'LinkedIn profile']].map(([href, label]) => href && (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer nofollow"
                className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-emerald-600 hover:text-emerald-800">
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-emerald-700" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <span className="text-xs text-slate-400" aria-hidden="true">↗</span>
              </a>
            ))}
          </div>
        )}
      </aside>
    </div>
    </div>
  );
}
