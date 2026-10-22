'use client';
import { useEffect, useState } from 'react';
import { api, useApi, interest, type Credits, type Resume } from '@/lib/api';
import Link from 'next/link';
import { ErrorText, TimeAgo, button, input } from '@/components/ui';
import { uploadResume } from '@/components/ResumeCard';
import { ResumeModal, type ViewableResume } from '@/components/ResumeModal';
import { TopUpModal } from '@/components/TopUpModal';

const PRESETS = [0, 1, 5, 10, 20];

const Bolt = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
    <path d="M11 2 4 11h5l-1 7 7-9h-5l1-7Z" fill="currentColor" />
  </svg>
);

// "8h 19m" until the free credits refill; updates every minute.
function useRefillIn(resetsAt: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const mins = Math.max(1, Math.ceil((new Date(resetsAt).getTime() - now) / 60_000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

// `onTopUp` is missing while top-ups are switched off in the admin panel, which hides every top-up prompt.
function CreditsPicker({ value, onChange, credits, onTopUp }: { value: number; onChange: (n: number) => void; credits: Credits; onTopUp?: () => void }) {
  const max = credits.remaining;
  const level = interest(value);
  const refillIn = useRefillIn(credits.resets_at);
  if (credits.remaining < 1) {
    return (
      <div className="space-y-2 border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-600">Credits</span>
          <span className="flex items-center gap-1 text-xs font-semibold text-slate-700"><Bolt className="h-3.5 w-3.5 text-amber-500" />0 left today</span>
        </div>
        <div className={`space-y-2.5 rounded-xl border p-3 ${onTopUp ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
          <p className="text-sm font-medium text-slate-900">You&apos;ve used today&apos;s credits.</p>
          <p className="text-xs leading-relaxed">
            You can still apply with 0 credits. Credits are optional: they just show the employer you&apos;re extra interested.
            Free credits refill in <strong>{refillIn}</strong>.
          </p>
          {onTopUp && <button type="button" onClick={onTopUp}
            className="w-full rounded-lg bg-amber-400 py-2 text-sm font-semibold text-slate-900 transition hover:bg-amber-300">Top up from ₱49</button>}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2 self-start border-t border-slate-100 pt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">Credits to bid <span className="font-normal text-slate-400">(optional)</span></span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${level.className}`}>{level.label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {PRESETS.filter((p) => p <= max).map((p) => (
          <button key={p} type="button" onClick={() => onChange(p)} aria-pressed={value === p}
            className={`h-7 flex-1 rounded-md border text-xs font-medium transition ${value === p ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-600'}`}>
            {p}
          </button>
        ))}
        <input type="number" min={0} max={max} value={value} aria-label="Custom credits"
          onChange={(e) => onChange(Math.min(max, Math.max(0, Math.trunc(Number(e.target.value)) || 0)))}
          className="h-7 w-12 shrink-0 rounded-md border border-slate-200 bg-white text-center text-xs focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20" />
      </div>
      <input type="range" min={0} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Credits" className="h-1.5 w-full accent-emerald-700" />
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <Bolt className="h-3.5 w-3.5 text-amber-500" />
        <span className="flex-1"><span className="font-medium text-slate-600">{credits.remaining}</span> of {credits.daily} left today · refills in {refillIn}</span>
        {onTopUp && <button type="button" onClick={onTopUp} className="font-medium text-emerald-800 hover:underline">Top up</button>}
      </p>
      <details className="text-xs text-slate-600">
        <summary className="cursor-pointer font-medium text-emerald-800">What are Credits?</summary>
        <p className="mt-2 leading-relaxed">
          Credits are optional. You can apply with 0. You get {credits.daily} free Credits every day; put them on the jobs
          you want most. Employers see applicants with the most Credits first, so it shows how interested you are.
          Unused free Credits don&apos;t carry over to the next day.
        </p>
      </details>
    </div>
  );
}

type MyApplication = { id: number; cover_letter: string; credits: number; resume_attached: boolean; created_at: string };

// Shown instead of the form once the worker has applied, so they can't apply twice.
function AlreadyApplied({ application: a, closed }: { application: MyApplication; closed: boolean }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-lg text-emerald-800" aria-hidden="true">✓</span>
        <div>
          <h2 className="font-semibold text-slate-900">You already applied</h2>
          <p className="text-xs text-slate-500">Sent <TimeAgo date={a.created_at} /></p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-slate-50 px-3 py-2"><dt className="text-xs text-slate-500">Credits bid</dt><dd className="font-medium text-slate-800">{a.credits}</dd></div>
        <div className="rounded-lg bg-slate-50 px-3 py-2"><dt className="text-xs text-slate-500">Resume</dt><dd className="font-medium text-slate-800">{a.resume_attached ? 'Attached' : 'Not attached'}</dd></div>
      </dl>
      <details className="text-sm">
        <summary className="font-medium text-emerald-800">View your cover letter</summary>
        <p className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-slate-700">{a.cover_letter}</p>
      </details>
      <p className="text-xs text-slate-500">
        {closed ? 'This job is now closed, so the employer is reviewing the applications they have.' : 'The employer will message you if you’re shortlisted.'}
      </p>
      <Link href="/dashboard" className="block rounded-lg border border-slate-300 py-2 text-center text-sm font-semibold text-slate-700 hover:border-emerald-600">
        My Applications
      </Link>
    </div>
  );
}

export function ApplyPanel({ jobId, closed }: { jobId: number; closed: boolean }) {
  const { data: mine, reload: reloadMine } = useApi<{ application: MyApplication | null }>(`/jobs/${jobId}/my-application`);
  const { data: credits, error: creditsError } = useApi<Credits>('/credits');
  const { data: settings } = useApi<{ topups_enabled: boolean }>('/settings');
  const { data: profileResume } = useApi<{ resume: Resume | null }>('/profile/resume');
  const [uploaded, setUploaded] = useState<Resume | null>(null);
  const [resumeStatus, setResumeStatus] = useState({ busy: false, error: '' });
  const [attach, setAttach] = useState(true);
  const resume = uploaded ?? profileResume?.resume;

  // Upload or replace the resume right here; the old file is deleted on the server.
  const [viewing, setViewing] = useState<ViewableResume | null>(null);
  // Signed links expire after a few minutes, so get a fresh one every time the viewer opens.
  async function viewResume() {
    try {
      const { resume: r } = await api<{ resume: Resume | null }>('/profile/resume');
      if (r) setViewing(r);
    } catch (err) {
      setResumeStatus({ busy: false, error: (err as Error).message });
    }
  }

  async function pickResume(file?: File) {
    if (!file) return;
    setResumeStatus({ busy: true, error: '' });
    try {
      const fresh = await uploadResume(file);
      setUploaded(fresh);
      setViewing((v) => (v ? fresh : v)); // keep the viewer showing the new file
      setAttach(true);
      setResumeStatus({ busy: false, error: '' });
    } catch (err) {
      setResumeStatus({ busy: false, error: (err as Error).message });
    }
  }
  const resumePicker = (label: string, className: string) => (
    <label className={`cursor-pointer ${className} has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-600/30`}>
      {resumeStatus.busy ? 'Uploading…' : label}
      <input type="file" accept="application/pdf,.pdf" className="sr-only" aria-label={`${label} (PDF, max 5 MB)`} disabled={resumeStatus.busy}
        onChange={(e) => { pickResume(e.target.files?.[0]); e.target.value = ''; }} />
    </label>
  );
  // The cover letter is kept as a draft in this browser until it's sent, e.g. while waiting for credits.
  const draftKey = `draft:cover-letter:${jobId}`;
  const [letter, setLetterState] = useState(() => { try { return localStorage.getItem(draftKey) ?? ''; } catch { return ''; } });
  const setLetter = (text: string) => {
    setLetterState(text);
    try { if (text) localStorage.setItem(draftKey, text); else localStorage.removeItem(draftKey); } catch { /* storage unavailable */ }
  };
  const [topUp, setTopUp] = useState(false);
  const [bid, setBid] = useState(1);
  const [status, setStatus] = useState({ sent: false, busy: false, error: '' });

  const spend = Math.min(bid, credits?.remaining ?? 0); // 0 when out of credits: applying still works

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ sent: false, busy: true, error: '' });
    try {
      await api(`/jobs/${jobId}/apply`, { body: { cover_letter: letter, credits: spend, attach_resume: attach } });
      try { localStorage.removeItem(draftKey); } catch { /* storage unavailable */ }
      setStatus({ sent: true, busy: false, error: '' });
    } catch (err) {
      setStatus({ sent: false, busy: false, error: (err as Error).message });
      reloadMine(); // e.g. applied from another tab: switch to the "already applied" view
    }
  }

  if (!mine) return <p className="text-sm text-slate-500">Loading…</p>;
  if (mine.application && !status.sent) return <AlreadyApplied application={mine.application} closed={closed} />;
  if (closed) {
    return (
      <div className="space-y-2 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
        </span>
        <h2 className="font-semibold">This job is closed</h2>
        <p className="text-sm text-slate-500">It&apos;s no longer accepting applications.</p>
        <Link href="/jobs" className="inline-block pt-1 text-sm font-semibold text-emerald-700 hover:text-emerald-900">Find similar jobs</Link>
      </div>
    );
  }
  if (status.sent) {
    return (
      <div className="space-y-2 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-800">✓</span>
        <h2 className="font-semibold">Application sent</h2>
        <p className="text-sm text-slate-500">You bid {spend} credit{spend === 1 ? '' : 's'}. The employer will contact you if you&apos;re shortlisted.</p>
      </div>
    );
  }
  if (creditsError) return <ErrorText msg={creditsError} />;
  if (!credits) return <p className="text-sm text-slate-500">Loading…</p>;

  const letterField = (rows: number) => (
    <div className="space-y-1.5">
      <textarea className={`${input} resize-y leading-relaxed`} rows={rows} required value={letter}
        onChange={(e) => setLetter(e.target.value)} aria-label="Cover letter"
        placeholder="Introduce yourself, share relevant experience, and explain why you're a great fit." />
      <p className="text-right text-xs text-slate-400">{letter.length.toLocaleString()} characters</p>
    </div>
  );
  // Optional resume: attach the one on the profile, or point to where to add one.
  const resumeRow = !profileResume ? null : (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium text-slate-700">Resume <span className="font-normal text-slate-400">(optional)</span></span>
      {resume ? (
        <div className={`space-y-3 rounded-xl border p-3 text-sm transition ${attach ? 'border-emerald-600 bg-emerald-50/50' : 'border-slate-200'}`}>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-700" />
            <span>
              <span className="block font-medium text-slate-800">Attach my resume</span>
              <span className="block text-xs text-slate-500">
                {attach ? 'Untick to apply without it.' : 'This application will be sent without your resume.'}
              </span>
            </span>
          </label>
          <div className={`flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 ${attach ? '' : 'opacity-60'}`}>
            <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600" aria-hidden="true">PDF</span>
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700" title={resume.name}>{resume.name}</span>
            <button type="button" onClick={viewResume}
              className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50">View</button>
            {resumePicker('Replace', 'shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100')}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-300 p-3 text-xs text-slate-500">
          <span className="flex-1">Add one to stand out. It also makes the employer&apos;s Smart Score more accurate. PDF, max 5 MB.</span>
          {resumePicker('Upload resume', 'shrink-0 rounded-lg border border-emerald-700 bg-white px-2.5 py-1 font-semibold text-emerald-800 hover:bg-emerald-50')}
        </div>
      )}
      <ErrorText msg={resumeStatus.error} />
    </div>
  );

  const submit = (
    <button className={`${button} w-full gap-2 py-3`} disabled={status.busy}>
      {status.busy ? 'Sending…' : <>Submit application <span className="flex items-center gap-0.5 rounded-md bg-white/15 px-1.5 py-0.5 text-xs"><Bolt className="h-3 w-3" />{spend}</span></>}
    </button>
  );

  return (
    <>
      <form onSubmit={apply} className="space-y-4">
        <h2 className="text-lg font-semibold">Apply for this job</h2>
        <div className="space-y-1.5">
          <span className="block text-sm font-medium text-slate-700">Cover letter</span>
          {letterField(10)}
        </div>
        {resumeRow}
        <CreditsPicker value={bid} onChange={setBid} credits={credits} onTopUp={settings?.topups_enabled ? () => setTopUp(true) : undefined} />
        <ErrorText msg={status.error} />
        {submit}
      </form>


      {settings?.topups_enabled && <TopUpModal open={topUp} onClose={() => setTopUp(false)} />}
      <ResumeModal resume={viewing} onClose={() => setViewing(null)}
        actions={resumePicker('Replace', 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:border-emerald-600')} />
    </>
  );
}
