'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { buttonGhost, card } from '@/components/ui';

// Opened from the link in an announcement email: stops announcements straight away (account emails such as
// codes and messages still arrive), with a way to subscribe again.
export default function UnsubscribePage() {
  const params = useSearchParams();
  const u = Number(params.get('u'));
  const t = params.get('t') ?? '';
  const [state, setState] = useState<'working' | 'off' | 'on' | 'error'>('working');
  const [busy, setBusy] = useState(false);
  const send = (on: boolean) => api<{ subscribed: boolean }>('/unsubscribe', { body: { u, t, on }, quiet: true });
  useEffect(() => {
    send(false).then(() => setState('off'), () => setState('error'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, for this link

  async function again() {
    setBusy(true);
    try { await send(true); setState('on'); } catch { setState('error'); } finally { setBusy(false); }
  }
  return (
    <div className={`${card} mx-auto my-10 max-w-md space-y-3 p-8 text-center`}>
      {state === 'working' && <p className="text-slate-500">One moment…</p>}
      {state === 'off' && <>
        <h1 className="font-display text-xl font-bold text-slate-900">You’re unsubscribed</h1>
        <p className="text-slate-600">You won’t get announcements from ReadyToWork.ph anymore. Emails about your account, like codes and new messages, still arrive.</p>
        <button type="button" onClick={again} disabled={busy} className={buttonGhost}>Subscribe again</button>
      </>}
      {state === 'on' && <>
        <h1 className="font-display text-xl font-bold text-slate-900">You’re subscribed again</h1>
        <p className="text-slate-600">You’ll get our announcements again.</p>
        <Link href="/" className={buttonGhost}>Go to ReadyToWork.ph</Link>
      </>}
      {state === 'error' && <>
        <h1 className="font-display text-xl font-bold text-slate-900">This link didn’t work</h1>
        <p className="text-slate-600">Please use the unsubscribe link from the email again, or <Link href="/contact" className="font-semibold text-emerald-700 underline">contact us</Link> and we’ll do it for you.</p>
      </>}
    </div>
  );
}
