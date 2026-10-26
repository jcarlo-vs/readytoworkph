'use client';
import { useState } from 'react';
import { API, read } from '@/lib/api';
import { ErrorText, Field, button, card, input } from '@/components/ui';
import { PageHeader, Seg, adminApi, failed, useAdmin } from '../ui';

type Result = {
  provider: 'vertex' | 'anthropic'; ms: number; score: number; verdict: string; strengths: string[]; concerns: string[];
  usage?: { input_tokens: number; output_tokens: number };
};
// Claude Haiku 5.5 list price per token (Anthropic's; Vertex AI can differ slightly).
const cost = (u: NonNullable<Result['usage']>) => (u.input_tokens * 0.1 + u.output_tokens * 0.5) / 1e6;

// A playground for the Smart Score: paste any job, add a PDF resume, and score it with Claude on Vertex AI or
// straight from Anthropic. Nothing is saved, and only the admin can open it.
export default function TestingZone() {
  const { logout } = useAdmin();
  const [job, setJob] = useState({ title: '', description: '' });
  const [resume, setResume] = useState<{ name: string; text: string } | null>(null);
  const [provider, setProvider] = useState<Result['provider']>('vertex');
  const [busy, setBusy] = useState<'' | 'reading' | 'scoring'>('');
  const [error, setError] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const fail = failed(logout, setError);

  async function readPdf(file?: File) {
    if (!file) return;
    setBusy('reading'); setError(''); setResume(null);
    try {
      const res = await fetch(`${API}/admin/testing/resume-text`, { method: 'POST', headers: { 'content-type': 'application/pdf' }, body: file });
      const { text } = await read<{ text: string }>(res, 'Could not read that PDF');
      setResume({ name: file.name, text });
    } catch (err) { fail(err as Error); } finally { setBusy(''); }
  }

  async function score(e: React.FormEvent) {
    e.preventDefault();
    setBusy('scoring'); setError('');
    try {
      const r = await adminApi<Result>('/testing/score', 'POST', { ...job, resume_text: resume?.text ?? '', provider });
      setResults((list) => [r, ...list]);
    } catch (err) { fail(err as Error); } finally { setBusy(''); }
  }

  return (
    <>
      <PageHeader title="Testing zone" sub="Try the Smart Score on any job and resume. Nothing is saved." />
      <form onSubmit={score} className={`${card} space-y-4`}>
        <Field label="Job title"><input className={input} required maxLength={200} value={job.title} onChange={(e) => setJob({ ...job, title: e.target.value })} placeholder="e.g. Executive Virtual Assistant" /></Field>
        <Field label="Job description">
          <textarea className={`${input} min-h-40`} required maxLength={20000} value={job.description} onChange={(e) => setJob({ ...job, description: e.target.value })} placeholder="Paste the full job post" />
        </Field>
        <Field label="Resume (PDF, up to 5 MB)">
          <input type="file" accept="application/pdf" onChange={(e) => readPdf(e.target.files?.[0])}
            className="block text-sm text-slate-600 file:mr-3 file:rounded-full file:border-0 file:bg-emerald-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-emerald-800 hover:file:bg-emerald-100" />
        </Field>
        {busy === 'reading' && <p className="text-sm text-slate-500">Reading the PDF…</p>}
        {resume && (
          <details className="rounded-xl bg-slate-50 p-3 text-sm">
            <summary className="cursor-pointer font-medium text-slate-700">
              {resume.name}: {resume.text ? `${resume.text.length.toLocaleString()} characters read` : 'no readable text (scanned image?)'}
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-slate-600">{resume.text}</pre>
          </details>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <Seg label="Run on" value={provider} onChange={setProvider} options={[['vertex', 'Vertex AI (Google)'], ['anthropic', 'Anthropic (direct)']]} />
          <button className={button} disabled={!!busy}>{busy === 'scoring' ? 'Scoring…' : 'Score'}</button>
        </div>
        {error && <ErrorText msg={error} />}
      </form>

      {results.map((r, i) => (
        <section key={results.length - i} className={`${card} space-y-3`}>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="font-display text-4xl font-extrabold text-emerald-900">{r.score}</span>
            <p className="flex-1 font-medium text-slate-800">{r.verdict}</p>
          </div>
          <p className="text-xs text-slate-500">
            {r.provider === 'vertex' ? 'Vertex AI' : 'Anthropic'} · {(r.ms / 1000).toFixed(1)} s
            {r.usage && <> · {r.usage.input_tokens.toLocaleString()} in / {r.usage.output_tokens.toLocaleString()} out · about ${cost(r.usage).toFixed(5)}</>}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {([['Strengths', r.strengths], ['Concerns', r.concerns]] as const).map(([title, list]) => (
              <div key={title}>
                <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-600">{list.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
