import Link from 'next/link';
import { button, buttonGhost, card } from '@/components/ui';

// Shown on talent pages to anyone who isn't a signed-in employer: worker profiles aren't public.
export function EmployerGate({ signedIn }: { signedIn: boolean }) {
  return (
    <div className={`${card} mx-auto max-w-xl space-y-4 p-10 text-center`}>
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-800" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM3 20a6 6 0 0 1 12 0M16 4a3.5 3.5 0 0 1 0 7M21 20a5 5 0 0 0-3.5-4.8" /></svg>
      </span>
      <h1 className="font-display text-2xl font-bold text-slate-900">Talent profiles are for employers</h1>
      <p className="text-slate-600">
        {signedIn
          ? 'Worker profiles are only visible to employers. Use an employer account to browse and hire talent.'
          : 'To protect our workers’ privacy, profiles are only visible to signed-in employers. Create a free employer account to browse and hire Filipino talent.'}
      </p>
      {signedIn ? (
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Link href="/jobs?sort=new" className={button}>Browse jobs</Link>
          <Link href="/dashboard" className={buttonGhost}>Go to my dashboard</Link>
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Link href="/register?role=employer" className={button}>Sign up as an employer</Link>
          <Link href="/login" className={buttonGhost}>Log in</Link>
        </div>
      )}
    </div>
  );
}
