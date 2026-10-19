import { card } from './styles';

// One friendly layout for "page not found" and "something went wrong", so visitors always get a way forward.
export function StatusPage({ code, title, text, children }: { code: string; title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
      <div className={`${card} mx-auto max-w-lg space-y-4 p-10 text-center`}>
        <p className="font-display text-5xl font-extrabold text-emerald-900/20">{code}</p>
        <h1 className="font-display text-2xl font-bold text-slate-900">{title}</h1>
        <p className="text-slate-600">{text}</p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">{children}</div>
        <p className="pt-2 text-sm text-slate-500">
          Still stuck? <a href="/contact" className="font-medium text-emerald-800 hover:underline">Contact us</a> or email support@readytowork.ph
        </p>
      </div>
    </div>
  );
}
