'use client';
import Script from 'next/script';
import { useEffect, useRef } from 'react';

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
// One Tap is shown once per page load: asking again while a request is pending makes Google
// abort the first one and log a FedCM AbortError (also seen when the user dismisses it).
let prompted = false;

type GoogleId = {
  initialize: (o: { client_id: string; callback: (r: { credential: string }) => void }) => void;
  renderButton: (el: HTMLElement, o: Record<string, string | number>) => void;
  prompt: () => void;
};
declare global {
  interface Window { google?: { accounts: { id: GoogleId } } }
}

// Google's official "Sign in with Google" button plus One Tap. Hidden until a client ID is configured.
export function GoogleButton({ text, onCredential }: { text: 'signin_with' | 'signup_with'; onCredential: (credential: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  useEffect(() => { callback.current = onCredential; });

  if (!CLIENT_ID) return null;
  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => {
          const id = window.google?.accounts.id;
          if (!id || !el.current) return;
          id.initialize({ client_id: CLIENT_ID, callback: (r) => callback.current(r.credential) });
          id.renderButton(el.current, { theme: 'outline', size: 'large', text, shape: 'rectangular', width: Math.min(400, el.current.offsetWidth) });
          if (!prompted) { prompted = true; id.prompt(); }
        }}
      />
      <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />or<span className="h-px flex-1 bg-slate-200" />
      </div>
      <div ref={el} className="flex min-h-11 w-full justify-center" />
    </>
  );
}
