'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useApi, type Worker } from '@/lib/api';
import { Skills, ErrorText, Initials, input, button, card } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { EmployerGate } from '@/components/EmployerGate';

export default function WorkersPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, ready } = useAuth();
  const employer = user?.role === 'employer';
  // The URL is the search: skill links and the back button both work. The form re-syncs when it changes.
  const query = params.toString();
  const fromUrl = () => ({ q: params.get('q') ?? '', skill: params.get('skill') ?? '' });
  const [form, setForm] = useState(fromUrl);
  const [shown, setShown] = useState(query);
  if (shown !== query) { setShown(query); setForm(fromUrl()); }
  const { data: workers, error } = useApi<Worker[]>(employer ? `/workers?${query}` : null);

  if (ready && !employer) return <EmployerGate signedIn={!!user} />;
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Hire Filipino talent</h1>
        <p className="mt-1 text-slate-600">Browse skilled remote professionals ready to join your team.</p>
      </div>

      <form className={`${card} grid gap-3 p-4 sm:grid-cols-[2fr_1fr_auto]`}
        onSubmit={(e) => { e.preventDefault(); router.push(`/workers?${new URLSearchParams(Object.entries(form).filter(([, v]) => v))}`); }}>
        <input className={input} placeholder="Role or keyword (e.g. bookkeeper)" aria-label="Search workers"
          value={form.q} onChange={(e) => setForm({ ...form, q: e.target.value })} />
        <input className={input} placeholder="Skill" aria-label="Skill"
          value={form.skill} onChange={(e) => setForm({ ...form, skill: e.target.value })} />
        <button className={button}>Search</button>
      </form>

      <ErrorText msg={error} />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {workers?.map((w) => (
          <li key={w.id}>
            <Link href={`/workers/${w.id}`} className={`${card} flex h-full flex-col gap-3 transition hover:border-emerald-600 hover:shadow-md`}>
              <div className="flex items-center gap-3">
                <Initials name={w.name} id={w.id} />
                <div className="min-w-0">
                  <h2 className="truncate font-semibold text-slate-900">{w.name}</h2>
                  <p className="truncate text-sm text-slate-600">{w.title}</p>
                </div>
              </div>
              <p className="line-clamp-2 text-sm text-slate-500">{w.bio}</p>
              <div className="mt-auto space-y-3">
                <Skills skills={w.skills.slice(0, 5)} />
                <p className="text-xs font-medium text-slate-500">
                  {w.availability}{w.hourly_rate && <> · <span className="text-emerald-700">${w.hourly_rate}/hr</span></>}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {workers?.length === 0 && <p className={`${card} text-center text-slate-500`}>No workers match your search yet.</p>}
    </div>
  );
}
