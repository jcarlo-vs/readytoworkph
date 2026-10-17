'use client';
import { useRef, useState } from 'react';
import { api, uploadFile, useApi, type Resume } from '@/lib/api';
import { ErrorText, TimeAgo, card } from '@/components/ui';
import { ResumeModal, type ViewableResume } from '@/components/ResumeModal';

const MAX_MB = 5;

// Checks the file in the browser, then uploads it as the worker's resume (replacing any previous one).
export async function uploadResume(file: File): Promise<Resume> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) throw new Error('Please choose a PDF file.');
  if (file.size > MAX_MB * 1024 * 1024) throw new Error(`That file is over ${MAX_MB} MB. Please upload a smaller PDF.`);
  return (await uploadFile<{ resume: Resume }>('/profile/resume', new Blob([file], { type: 'application/pdf' }), file.name)).resume;
}

// Optional resume on the worker's profile: upload, view, replace or remove a PDF.
export function ResumeCard() {
  const { data } = useApi<{ resume: Resume | null }>('/profile/resume');
  const [resume, setResume] = useState<Resume | null | undefined>(undefined);
  const [status, setStatus] = useState({ busy: false, error: '' });
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const [viewing, setViewing] = useState<ViewableResume | null>(null);
  const current = resume === undefined ? data?.resume : resume;

  async function upload(file?: File) {
    if (!file) return;
    setStatus({ busy: true, error: '' });
    try {
      setResume(await uploadResume(file));
      setStatus({ busy: false, error: '' });
    } catch (err) {
      setStatus({ busy: false, error: (err as Error).message });
    } finally {
      if (picker.current) picker.current.value = '';
    }
  }

  async function remove() {
    setStatus({ busy: true, error: '' });
    try {
      await api('/profile/resume', { method: 'DELETE' });
      setResume(null);
      setStatus({ busy: false, error: '' });
    } catch (err) {
      setStatus({ busy: false, error: (err as Error).message });
    }
  }

  const fileInput = (
    <input ref={picker} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="Upload resume (PDF)"
      onChange={(e) => upload(e.target.files?.[0])} />
  );

  return (
    <section className={`${card} space-y-4`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Resume <span className="text-sm font-normal text-slate-400">(optional)</span></h2>
        <span className="text-xs text-slate-500">PDF · max {MAX_MB} MB</span>
      </div>
      <p className="text-sm text-slate-500">Attach it to your applications so employers can see your full experience. Only employers you apply to can open it, and replacing it updates every application you attached it to.</p>

      {data === null ? null : current ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-red-50 text-xs font-bold text-red-600" aria-hidden="true">PDF</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-slate-900">{current.name}</p>
            <p className="text-xs text-slate-500">Uploaded <TimeAgo date={current.uploaded_at} /></p>
          </div>
          <div className="flex gap-2 text-sm">
            <button type="button" onClick={async () => { const r = await api<{ resume: Resume | null }>('/profile/resume'); if (r.resume) setViewing(r.resume); }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:border-emerald-600">View</button>
            <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:border-emerald-600 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-600/30">
              {status.busy ? 'Uploading…' : 'Replace'}{fileInput}
            </label>
            <button type="button" onClick={remove} disabled={status.busy} className="rounded-lg px-3 py-1.5 font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">Remove</button>
          </div>
        </div>
      ) : (
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files[0]); }}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-600/30
            ${dragging ? 'border-emerald-600 bg-emerald-50' : 'border-slate-300 hover:border-emerald-600 hover:bg-slate-50'}`}>
          <svg viewBox="0 0 24 24" className="h-8 w-8 text-emerald-700" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
          </svg>
          <span className="font-medium text-slate-800">{status.busy ? 'Uploading…' : <>Drag your resume here or <span className="text-emerald-800 underline">browse</span></>}</span>
          <span className="text-xs text-slate-500">PDF only, up to {MAX_MB} MB</span>
          {fileInput}
        </label>
      )}
      <ErrorText msg={status.error} />
      <ResumeModal resume={viewing} onClose={() => setViewing(null)} />
    </section>
  );
}
