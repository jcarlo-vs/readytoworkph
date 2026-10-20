import Link from 'next/link';

// Who runs the site, as named in the Terms. Paddle asks for the legal name of a sole proprietor.
export const OPERATOR = 'Juan Carlo Senin';
export const CONTACT = 'support@readytowork.ph';
export const UPDATED = 'October 20, 2026';

// Shared layout for the Terms, Privacy and Refund pages: plain server-rendered text, readable without JavaScript.
export function LegalPage({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl space-y-8 text-slate-700 [counter-reset:section]">
      <header className="space-y-3 border-b border-slate-200 pb-6">
        <h1 className="font-display text-3xl font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500">Last updated {UPDATED}</p>
        <p className="leading-relaxed">{intro}</p>
      </header>
      {children}
      <nav className="flex flex-wrap gap-4 border-t border-slate-200 pt-6 text-sm">
        <Link href="/terms" className="text-emerald-800 hover:underline">Terms of Service</Link>
        <Link href="/privacy" className="text-emerald-800 hover:underline">Privacy Policy</Link>
        <Link href="/refunds" className="text-emerald-800 hover:underline">Refund Policy</Link>
      </nav>
    </article>
  );
}

// Numbered automatically (1., 2., ...) in page order.
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 leading-relaxed [counter-increment:section] [&_a]:font-medium [&_a]:text-emerald-800 [&_a]:underline [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
      <h2 className="text-lg font-semibold text-slate-900 before:content-[counter(section)_'._']">{title}</h2>
      {children}
    </section>
  );
}

export const Mail = () => <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;
