'use client';
import { useModal } from '@/components/useModal';

export type ViewableResume = { name: string; url: string };

// Full-screen-ish PDF viewer in a native <dialog> (Esc closes, focus is trapped).
// `actions` adds extra buttons to the header, e.g. Replace for the resume's owner.
export function ResumeModal({ resume, onClose, actions }: { resume: ViewableResume | null; onClose: () => void; actions?: React.ReactNode }) {
  const dialog = useModal(!!resume, onClose);

  return (
    <dialog ref={dialog} onClose={onClose} aria-label={resume ? `Resume: ${resume.name}` : 'Resume'}
      onClick={(e) => { if (e.target === dialog.current) onClose(); }}
      className="m-auto h-[90vh] w-[min(60rem,calc(100vw-2rem))] overflow-hidden rounded-2xl p-0 shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm">
      {resume && (
        <div className="flex h-full flex-col">
          <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-3">
            <span className="rounded-md bg-red-50 px-1.5 py-1 text-[11px] font-bold text-red-600" aria-hidden="true">PDF</span>
            <p className="min-w-0 flex-1 truncate font-semibold text-slate-900">{resume.name}</p>
            <div className="flex items-center gap-2 text-sm">
              {actions}
              <a href={resume.url} target="_blank" rel="noopener noreferrer"
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:border-emerald-600">
                Open in new tab
              </a>
              <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
                <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" /></svg>
              </button>
            </div>
          </header>
          <iframe key={resume.url} src={resume.url} title={`Resume: ${resume.name}`} className="min-h-0 w-full flex-1 bg-slate-100" />
        </div>
      )}
    </dialog>
  );
}
