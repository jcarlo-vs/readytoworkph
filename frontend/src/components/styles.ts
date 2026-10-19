// Shared class names, in a plain module so both server and client components can use them.
// Look: "band + soft". Pages open with a dark-green band (PageBand); everything below sits on soft,
// borderless white cards with pill buttons.
export const button = 'inline-flex items-center justify-center rounded-full bg-emerald-950 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.97] hover:bg-emerald-900 disabled:opacity-50';
export const buttonGold = 'inline-flex items-center justify-center rounded-full bg-amber-400 px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition active:scale-[0.97] hover:bg-amber-300';
export const buttonGhost = 'inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition active:scale-[0.97] hover:border-emerald-600 hover:text-emerald-700';
export const card = 'rounded-2xl border border-emerald-950/5 bg-white p-6 shadow-[0_1px_0_rgba(2,44,34,0.04),0_10px_28px_-20px_rgba(2,44,34,0.3)]';
// The dark-green band with a soft, lighter glow in the top corner.
export const band = 'rounded-3xl bg-[radial-gradient(120%_140%_at_100%_0%,#065f46_0%,#022c22_58%)] text-white';
