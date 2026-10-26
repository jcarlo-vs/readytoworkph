'use client';
import { useState } from 'react';
import { card } from '@/components/ui';
import { adminApi } from './ui';

// Confirm before suspending (or lifting it), and say exactly what it does.
export function SuspendDialog({ user, onClose, onDone, onError }: { user: { id: number; name: string; email: string; role: string; suspended_at: string | null }; onClose: () => void; onDone: (at: string | null) => void; onError: (e: Error) => void }) {
  const [busy, setBusy] = useState(false);
  const lifting = !!user.suspended_at;
  async function go() {
    setBusy(true);
    try { onDone((await adminApi<{ suspended_at: string | null }>(`/users/${user.id}/suspend`, 'PUT', { suspended: !lifting })).suspended_at); }
    catch (err) { onError(err as Error); }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="dialog" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }} aria-modal="true" aria-labelledby="susp-title">
      <div className={`${card} w-full max-w-md space-y-3`}>
        <h2 id="susp-title" className="text-lg font-bold">{lifting ? `Lift the suspension on ${user.name}?` : `Suspend ${user.name}?`}</h2>
        <p className="text-sm text-slate-500">{user.email}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          {lifting ? <>
            <li>They can log in again, and their email can sign up again.</li>
            <li>{user.role === 'employer' ? 'Their open jobs' : 'Their profile'} show again in search.</li>
          </> : <>
            <li>Signed out on every device; they can&apos;t log in.</li>
            <li>{user.role === 'employer' ? 'Their jobs are hidden and stop taking applications.' : 'Their profile is hidden from search.'} Nobody can message them.</li>
            <li>Their email can&apos;t be used to sign up again, even if the account is deleted.</li>
          </>}
        </ul>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="button" onClick={go} disabled={busy}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${lifting ? 'bg-emerald-800 hover:bg-emerald-900' : 'bg-red-600 hover:bg-red-700'}`}>
            {busy ? 'Saving…' : lifting ? 'Lift suspension' : 'Suspend account'}
          </button>
        </div>
      </div>
    </div>
  );
}
