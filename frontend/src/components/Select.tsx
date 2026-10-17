'use client';
import { useEffect, useId, useRef, useState } from 'react';

export type Option = { value: string; label: string; hint?: string; dot?: string };

export const JOB_TYPES: Option[] = [
  { value: 'full-time', label: 'Full-time', dot: 'bg-emerald-500' },
  { value: 'part-time', label: 'Part-time', dot: 'bg-amber-400' },
  { value: 'gig', label: 'Gig', dot: 'bg-violet-400' },
];

type Props = { value: string; onChange: (v: string) => void; options: Option[]; label: string; placeholder?: string };

export function Select({ value, onChange, options, label, placeholder = 'Select…' }: Props) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const show = () => { setActive(Math.max(0, options.indexOf(selected!))); setOpen(true); };
  const pick = (i: number) => { onChange(options[i].value); setOpen(false); };

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show(); }
      return;
    }
    const last = options.length - 1;
    const moves: Record<string, () => void> = {
      ArrowDown: () => setActive((a) => Math.min(a + 1, last)),
      ArrowUp: () => setActive((a) => Math.max(a - 1, 0)),
      Home: () => setActive(0),
      End: () => setActive(last),
      Enter: () => pick(active),
      ' ': () => pick(active),
      Escape: () => setOpen(false),
    };
    if (e.key === 'Tab') return setOpen(false);
    if (moves[e.key]) { e.preventDefault(); moves[e.key](); }
  }

  return (
    <div ref={root} className="relative">
      <div
        role="combobox" tabIndex={0} aria-label={label} aria-haspopup="listbox"
        aria-expanded={open} aria-controls={`${id}-list`}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : show())} onKeyDown={onKeyDown}
        className={`flex w-full cursor-pointer select-none items-center gap-2.5 rounded-lg border bg-white px-3.5 py-2.5 text-sm shadow-sm transition
          focus:outline-none focus-visible:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-600/20
          ${open ? 'border-emerald-600 ring-2 ring-emerald-600/20' : 'border-slate-300 hover:border-slate-400'}`}
      >
        {selected?.dot && <span className={`h-2 w-2 shrink-0 rounded-full ${selected.dot}`} />}
        <span className={`flex-1 truncate ${selected ? 'text-slate-900' : 'text-slate-400'}`}>{selected?.label ?? placeholder}</span>
        <svg viewBox="0 0 20 20" aria-hidden className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180 text-emerald-600' : ''}`}>
          <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <ul
        id={`${id}-list`} role="listbox" aria-label={label}
        className={`absolute z-30 mt-2 w-full min-w-48 origin-top overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10 transition
          ${open ? 'visible scale-100 opacity-100' : 'invisible scale-95 opacity-0'}`}
      >
        {options.map((o, i) => {
          const isSelected = o.value === value;
          return (
            <li
              key={o.value} id={`${id}-${i}`} role="option" aria-selected={isSelected}
              onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(i)}
              className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm ${i === active ? 'bg-emerald-50' : ''}`}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${o.dot ?? 'bg-slate-300'}`} />
              <span className="flex-1">
                <span className={`block ${isSelected ? 'font-semibold text-emerald-800' : 'text-slate-800'}`}>{o.label}</span>
                {o.hint && <span className="block text-xs text-slate-500">{o.hint}</span>}
              </span>
              {isSelected && (
                <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4 shrink-0 text-emerald-600">
                  <path d="M4.5 10.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
