'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ErrorText, Field, FormAlert, PageBand, button, card, input } from '@/components/ui';
import { Turnstile, robotCheckOn } from '@/components/Turnstile';

const MAX = 5000;

// Contact us: a support request lands in the admin inbox and the support mailbox, where Reply goes
// straight back to the sender. Visitors pass the robot check; signed-in people skip it.
export default function ContactPage() {
  const { user } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', subject: useSearchParams().get('subject')?.slice(0, 150) ?? '', message: '' });
  const [prefilled, setPrefilled] = useState(false);
  if (user && !prefilled) { setPrefilled(true); setForm((f) => ({ ...f, name: f.name || user.name, email: f.email || user.email })); }
  const [status, setStatus] = useState({ busy: false, error: '', sent: false });
  const [robotToken, setRobotToken] = useState('');
  const [robotKey, setRobotKey] = useState(0);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const tooLong = form.message.length > MAX;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ busy: true, error: '', sent: false });
    try {
      await api('/contact', { body: { ...form, page: document.referrer ? new URL(document.referrer).pathname : null, ...(!user && { turnstile: robotToken }) } });
      setStatus({ busy: false, error: '', sent: true });
    } catch (err) {
      setStatus({ busy: false, error: (err as Error).message, sent: false });
      setRobotToken(''); setRobotKey((k) => k + 1); // a token works once
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
    <PageBand title="Contact us" sub="A question about your account, a plan, a payment or a job post? Send us a message and we’ll reply by email." />
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section className={`${card} space-y-5 p-8`}>
        {status.sent ? (
          <FormAlert tone="success" title="Message sent. Thank you!">
            <p>We&apos;ll reply to <strong>{form.email}</strong>, usually within one working day. Check your Spam folder if you don&apos;t see it.</p>
            <p><button type="button" className="font-semibold underline underline-offset-2" onClick={() => { setForm({ ...form, subject: '', message: '' }); setStatus({ busy: false, error: '', sent: false }); setRobotKey((k) => k + 1); }}>Send another message</button></p>
          </FormAlert>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Your name"><input id="contact-name" className={input} required maxLength={100} autoComplete="name" value={form.name} onChange={set('name')} /></Field>
              <Field label="Email"><input id="contact-email" className={input} type="email" required maxLength={200} autoComplete="email" value={form.email} onChange={set('email')} /></Field>
            </div>
            <Field label="Subject"><input id="contact-subject" className={input} required maxLength={150} placeholder="e.g. Question about the Premium plan" value={form.subject} onChange={set('subject')} /></Field>
            <Field label="Message">
              <textarea id="contact-message" className={`${input} resize-y${tooLong ? ' border-red-500' : ''}`} rows={6} required minLength={5} value={form.message} onChange={set('message')}
                aria-invalid={tooLong} aria-describedby="contact-count" />
              <p id="contact-count" className={`mt-1 text-right text-xs ${tooLong ? 'font-semibold text-red-600' : 'text-slate-400'}`}>
                {form.message.length.toLocaleString('en-US')} / {MAX.toLocaleString('en-US')}
              </p>
            </Field>
            {!user && <Turnstile key={robotKey} onToken={setRobotToken} />}
            <ErrorText msg={status.error} />
            <button className={`${button} w-full py-3 sm:w-auto sm:px-8`} disabled={status.busy || tooLong || (!user && robotCheckOn && !robotToken)}>
              {status.busy ? 'Sending…' : 'Send message'}
            </button>
          </form>
        )}
      </section>
      <aside className="space-y-4">
        <div className={`${card} space-y-2`}>
          <h2 className="font-semibold">Email us directly</h2>
          <p className="select-all text-sm font-medium text-emerald-800">support@readytowork.ph</p>
          <p className="text-sm text-slate-500">We usually reply within one working day (Philippine time).</p>
        </div>
        <div className={`${card} space-y-2`}>
          <h2 className="font-semibold">Quick answers</h2>
          <ul className="space-y-1.5 text-sm">
            <li><Link href="/pricing#faq" className="text-emerald-700 hover:underline">Plans, billing and cancelling</Link></li>
            <li><Link href="/refunds" className="text-emerald-700 hover:underline">Refund policy</Link></li>
            <li><Link href="/forgot-password" className="text-emerald-700 hover:underline">Reset your password</Link></li>
          </ul>
        </div>
      </aside>
    </div>
    </div>
  );
}
