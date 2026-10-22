'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { ErrorText, buttonGold } from '@/components/ui';
import { useModal } from '@/components/useModal';

// `rows` are applications ({ id: application id, name }), so each message is tagged with the job applied to.
// One message to many applicants. Each gets it in their own private chat, tagged with the job they applied to.
// `onRemove` un-ticks someone in the owner's list, so the table and the To list stay the same.
export function BulkMessage({ rows, max = 50, onClose, onSent, onRemove }: { rows: { id: number; name: string }[]; max?: number; onClose: () => void; onSent: (note: string) => void; onRemove: (id: number) => void }) {
  const dialog = useModal(true, onClose);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await api<{ sent: number; skipped: { name: string; reason: string }[] }>('/messages/bulk', { body: { application_ids: rows.map((r) => r.id), body } });
      onSent(`Sent to ${res.sent} ${res.sent === 1 ? 'person' : 'people'}.${res.skipped.length ? ` Skipped: ${res.skipped.map((s) => `${s.name} (${s.reason})`).join(', ')}.` : ''}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  // A side panel from the right (a native <dialog>, so Esc closes it and focus stays inside).
  return (
    <dialog ref={dialog} data-panel onClose={onClose} aria-labelledby="bulk-title" onClick={(e) => { if (e.target === dialog.current) onClose(); }}
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-[min(30rem,100vw)] max-w-none bg-white p-0 shadow-2xl backdrop:bg-slate-950/40">
      <form onSubmit={send} className="flex h-full flex-col text-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <h2 id="bulk-title" className="flex-1 text-lg font-bold text-slate-900">Message {rows.length} {rows.length === 1 ? 'applicant' : 'applicants'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-lg text-slate-600 hover:bg-slate-200">×</button>
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">To</p>
            <ul className="flex flex-wrap gap-1.5">
              {rows.map((r) => (
                <li key={r.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 py-1 pl-2.5 pr-1 text-xs font-medium text-emerald-900 ring-1 ring-emerald-200">
                  {r.name}
                  <button type="button" onClick={() => { onRemove(r.id); if (rows.length === 1) onClose(); }} aria-label={`Remove ${r.name}`}
                    className="grid h-4 w-4 place-items-center rounded-full text-emerald-700 hover:bg-emerald-200 hover:text-emerald-950">×</button>
                </li>
              ))}
            </ul>
          </div>
          <label className="flex flex-1 flex-col">
            <span className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Message</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} required maxLength={5000} autoFocus
              placeholder="Hi! Thanks for applying. Are you free for a short video call this week?"
              className="min-h-48 w-full flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 leading-relaxed text-slate-900 focus:border-emerald-600 focus:outline-none" />
          </label>
          <p className="text-xs text-slate-500">Each person gets this in their own private chat, about the job they applied to. Nobody sees who else got it.{rows.length > max && ` You can message up to ${max} at once.`}</p>
          <ErrorText msg={error} />
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button disabled={busy || rows.length > max} className={`${buttonGold} px-4 py-2 text-sm disabled:opacity-50`}>{busy ? 'Sending…' : `Send to ${rows.length}`}</button>
        </div>
      </form>
    </dialog>
  );
}

