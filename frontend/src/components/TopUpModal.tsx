'use client';
import { useModal } from '@/components/useModal';

const PACKS = [
  { credits: 100, price: 49 },
  { credits: 200, price: 129, popular: true },
  { credits: 500, price: 299 },
];

// Credit packs for workers. ponytail: no checkout yet (PayMongo comes later), so packs are informational.
export function TopUpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useModal(open, onClose);

  return (
    <dialog ref={dialog} onClose={onClose} aria-labelledby="topup-title"
      onClick={(e) => { if (e.target === dialog.current) onClose(); }}
      className="mx-auto mt-[8vh] w-[min(36rem,calc(100vw-2rem))] rounded-2xl p-0 shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm">
      <div className="space-y-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="topup-title" className="text-xl font-bold text-slate-900">Top up Credits</h2>
            <p className="mt-1 text-sm text-slate-500">Keep applying today, and bid more on the jobs you want most.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" /></svg>
          </button>
        </div>

        <ul className="grid gap-3 sm:grid-cols-3">
          {PACKS.map((p) => (
            <li key={p.credits} className={`relative rounded-xl border p-4 text-center ${p.popular ? 'border-emerald-950 ring-1 ring-emerald-950' : 'border-slate-200'}`}>
              {p.popular && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-slate-900">Popular</span>}
              <p className="text-2xl font-bold text-slate-900">{p.credits}</p>
              <p className="text-xs text-slate-500">credits</p>
              <p className="mt-3 text-lg font-semibold text-emerald-900">₱{p.price}</p>
              <p className="text-[11px] text-slate-400">₱{(p.price / p.credits).toFixed(2)} each</p>
            </li>
          ))}
        </ul>

        <ul className="space-y-1.5 text-sm text-slate-600">
          <li>✓ Bought credits <strong className="font-medium text-slate-800">never expire</strong></li>
          <li>✓ Your free daily credits are always used first</li>
          <li>✓ Max 60 credits per application, so it stays fair for everyone</li>
          <li>✓ Credits change your place in the list, not the employer&apos;s decision</li>
        </ul>

        <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Online top-ups are coming soon</p>
          <p className="mt-0.5 text-amber-800">You&apos;ll pay with GCash, Maya, GrabPay or card. Until then, your free credits refill every midnight.</p>
        </div>
        <button type="button" disabled className="w-full rounded-lg bg-emerald-950 py-3 text-sm font-semibold text-white opacity-50">Pay with GCash · coming soon</button>
      </div>
    </dialog>
  );
}
