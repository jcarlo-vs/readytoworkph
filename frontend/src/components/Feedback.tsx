'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ErrorText, input } from '@/components/ui';
import { Turnstile, robotCheckOn } from '@/components/Turnstile';

// "Send feedback" opens one shared popup from anywhere (profile menu, footer): call openFeedback().
const OPEN = 'open-feedback';
export const openFeedback = () => window.dispatchEvent(new Event(OPEN));

const MAX = 2000;
const TYPES = [
  { id: 'idea', label: 'Idea', icon: 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2Z' },
  { id: 'bug', label: 'Something broke', icon: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z' },
  { id: 'other', label: 'Other', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z' },
] as const;
type Type = (typeof TYPES)[number]['id'];

export function FeedbackDialog() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<Type>('idea');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [contactOk, setContactOk] = useState(true);
  const [status, setStatus] = useState<{ busy: boolean; error: string; sent: boolean }>({ busy: false, error: '', sent: false });
  const [robotToken, setRobotToken] = useState(''); // visitors only: signed-in people skip the robot check
  const [robotKey, setRobotKey] = useState(0);
  const box = useRef<HTMLTextAreaElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const show = () => { opener.current = document.activeElement; setStatus({ busy: false, error: '', sent: false }); setOpen(true); };
    window.addEventListener(OPEN, show);
    return () => window.removeEventListener(OPEN, show);
  }, []);
  useEffect(() => {
    if (!open) return;
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); (opener.current as HTMLElement | null)?.focus?.(); };
  }, [open]);
  // After a thank-you, close by itself.
  useEffect(() => {
    if (!status.sent) return;
    const t = setTimeout(() => setOpen(false), 2500);
    return () => clearTimeout(t);
  }, [status.sent]);

  if (!open) return null;
  const tooLong = message.length > MAX;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ busy: true, error: '', sent: false });
    try {
      await api('/feedback', { body: { type, message, page: location.pathname + location.search, contact_ok: contactOk, ...(!user && { turnstile: robotToken }), ...(!user && email && { email }) } });
      setStatus({ busy: false, error: '', sent: true });
      setMessage('');
    } catch (err) {
      setStatus({ busy: false, error: (err as Error).message, sent: false });
      setRobotToken(''); setRobotKey((k) => k + 1); // a token works once
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => !status.busy && setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-labelledby="feedback-title" onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        {status.sent ? (
          <div className="space-y-3 py-6 text-center" role="status">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
            </span>
            <h2 id="feedback-title" className="text-lg font-semibold text-slate-900">Thank you!</h2>
            <p className="text-sm text-slate-600">We read every message and use it to decide what to improve next.</p>
          </div>
        ) : (
          <form onSubmit={send} className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="feedback-title" className="text-lg font-semibold text-slate-900">Send feedback</h2>
                <p className="text-sm text-slate-500">What should we improve? We read every message.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m5.5 5.5 9 9m0-9-9 9" /></svg>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Feedback type">
              {TYPES.map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={type === t.id} onClick={() => setType(t.id)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-semibold transition ${type === t.id ? 'border-emerald-700 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-700 hover:border-slate-300'}`}>
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={t.icon} /></svg>
                  {t.label}
                </button>
              ))}
            </div>
            <div>
              <label htmlFor="feedback-message" className="mb-1 block text-sm font-medium text-slate-700">Your message</label>
              <textarea id="feedback-message" ref={box} rows={5} required value={message} onChange={(e) => setMessage(e.target.value)}
                placeholder={type === 'bug' ? 'What happened, and what did you expect?' : type === 'idea' ? 'e.g. I’d love to filter applicants by hourly rate.' : 'Tell us anything.'}
                aria-invalid={tooLong} aria-describedby="feedback-count"
                className={`${input} resize-y${tooLong ? ' border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''}`} />
              <p id="feedback-count" className={`mt-1 text-right text-xs ${tooLong ? 'font-semibold text-red-600' : 'text-slate-400'}`}>
                {tooLong ? `Too long by ${(message.length - MAX).toLocaleString('en-US')} characters. ` : ''}{message.length.toLocaleString('en-US')} / {MAX.toLocaleString('en-US')}
              </p>
            </div>
            {!user && (
              <div>
                <label htmlFor="feedback-email" className="mb-1 block text-sm font-medium text-slate-700">Your email <span className="font-normal text-slate-400">(optional, so we can reply)</span></label>
                <input id="feedback-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} placeholder="you@example.com" />
              </div>
            )}
            {(user || email) && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={contactOk} onChange={(e) => setContactOk(e.target.checked)} className="h-4 w-4 accent-emerald-700" />
                You can email me about this
              </label>
            )}
            {!user && <Turnstile key={robotKey} onToken={setRobotToken} />}
            <ErrorText msg={status.error} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button disabled={status.busy || !message.trim() || tooLong || (!user && robotCheckOn && !robotToken)} className="rounded-lg bg-emerald-950 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-50">
                {status.busy ? 'Sending…' : 'Send feedback'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
