'use client';
import { useEffect, useRef } from 'react';

// Cloudflare Turnstile, the "I'm human" check on forms bots abuse (sign-up, login after 2 misses, forgot
// password, contact, visitor feedback). Usually it just shows a tick with no puzzle. The server checks
// every token; without a site key (local development) nothing shows and the server skips the check.
// A token works once: after a failed submit, remount the widget (change its `key`) to get a fresh one.
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
export const robotCheckOn = !!SITE_KEY;

type TurnstileApi = { render: (el: HTMLElement, o: Record<string, unknown>) => string; remove: (id: string) => void };
let loading: Promise<TurnstileApi> | null = null;
const load = () => loading ??= new Promise((resolve, reject) => {
  const s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  s.async = true;
  s.onload = () => resolve((window as unknown as { turnstile: TurnstileApi }).turnstile);
  s.onerror = () => { loading = null; s.remove(); reject(new Error('Robot check failed to load')); };
  document.head.appendChild(s);
});

export function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  useEffect(() => { callback.current = onToken; });
  useEffect(() => {
    if (!SITE_KEY) return;
    let id: string | undefined;
    let live = true;
    load().then((t) => {
      if (!live || !box.current) return;
      id = t.render(box.current, {
        sitekey: SITE_KEY, theme: 'light', size: 'flexible',
        callback: (token: string) => callback.current(token),
        'expired-callback': () => callback.current(''),
        'error-callback': () => callback.current(''),
      });
    }, () => callback.current(''));
    return () => { live = false; if (id) (window as unknown as { turnstile?: TurnstileApi }).turnstile?.remove(id); };
  }, []);
  if (!SITE_KEY) return null;
  return <div ref={box} className="min-h-[65px]" aria-label="Security check" />;
}
