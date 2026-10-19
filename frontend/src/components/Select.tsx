'use client';
import { useEffect, useId, useRef, useState } from 'react';

export type Option = { value: string; label: string; hint?: string; dot?: string };

export const JOB_TYPES: Option[] = [
  { value: 'full-time', label: 'Full-time', dot: 'bg-emerald-500' },
  { value: 'part-time', label: 'Part-time', dot: 'bg-amber-400' },
  { value: 'gig', label: 'Gig', dot: 'bg-violet-400' },
];

// `searchable` adds a search box at the top of the list (for long lists, e.g. picking one of many jobs).
// At most `limit` options are listed at once; search always looks through all of them, so a list of
// hundreds stays short and fast and people type to find the rest.
type Props = {
  value: string; onChange: (v: string) => void; options: Option[]; label: string; placeholder?: string;
  searchable?: boolean; className?: string; limit?: number; noun?: string;
};

export function Select({ value, onChange, options, label, placeholder = 'Select…', searchable = false, className = '', limit = 50, noun = 'options' }: Props) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState('');
  const selected = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const matches = q ? options.filter((o) => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(q)) : options;
  const shown = matches.slice(0, limit);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  // The search box takes focus while open; closing hands focus back to the dropdown itself.
  useEffect(() => { if (open && searchable) search.current?.focus(); }, [open, searchable]);
  useEffect(() => { if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [open, active, id]);

  const show = () => { setQuery(''); setActive(Math.max(0, options.slice(0, limit).indexOf(selected!))); setOpen(true); };
  const hide = () => { setOpen(false); if (searchable) trigger.current?.focus(); };
  const pick = (i: number) => { if (!shown[i]) return; onChange(shown[i].value); hide(); };

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show(); }
      return;
    }
    const last = shown.length - 1;
    const moves: Record<string, () => void> = {
      ArrowDown: () => setActive((a) => Math.min(a + 1, last)),
      ArrowUp: () => setActive((a) => Math.max(a - 1, 0)),
      Enter: () => pick(active),
      Escape: hide,
      // while searching, Home/End/Space type into the box instead
      ...(!searchable && { Home: () => setActive(0), End: () => setActive(last), ' ': () => pick(active) }),
    };
    if (e.key === 'Tab') return setOpen(false);
    if (moves[e.key]) { e.preventDefault(); moves[e.key](); }
  }

  return (
    <div ref={root} className={`relative ${className}`}>
      <div
        ref={trigger} role="combobox" tabIndex={0} aria-label={label} aria-haspopup="listbox"
        aria-expanded={open} aria-controls={`${id}-list`}
        aria-activedescendant={open && !searchable && shown[active] ? `${id}-${active}` : undefined}
        onClick={() => (open ? hide() : show())} onKeyDown={onKeyDown}
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

      <div className={`absolute z-30 mt-2 w-full min-w-56 origin-top overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 transition
          ${open ? 'visible scale-100 opacity-100' : 'invisible scale-95 opacity-0'}`}>
        {searchable && (
          <div className="border-b border-slate-100 p-1.5">
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
              <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4 shrink-0 text-slate-400">
                <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path d="m13.5 13.5 3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <input ref={search} value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKeyDown}
                placeholder="Search…" aria-label={`Search ${label.toLowerCase()}`} aria-controls={`${id}-list`}
                aria-activedescendant={open && shown[active] ? `${id}-${active}` : undefined}
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none" />
            </div>
          </div>
        )}
        <ul id={`${id}-list`} role="listbox" aria-label={label} className="max-h-72 overflow-y-auto p-1.5">
          {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">No matches for &ldquo;{query.trim()}&rdquo;</li>}
          {shown.map((o, i) => {
            const isSelected = o.value === value;
            return (
              <li
                key={o.value} id={`${id}-${i}`} role="option" aria-selected={isSelected}
                onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(i)}
                className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm ${i === active ? 'bg-emerald-50' : ''}`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${o.dot ?? 'bg-slate-300'}`} />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate ${isSelected ? 'font-semibold text-emerald-800' : 'text-slate-800'}`}>{o.label}</span>
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
        {matches.length > shown.length && (
          <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
            Showing {shown.length} of {matches.length.toLocaleString('en-US')} {noun}.{searchable && ' Type to find the rest.'}
          </p>
        )}
      </div>
    </div>
  );
}
