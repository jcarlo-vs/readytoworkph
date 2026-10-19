'use client';
import Script from 'next/script';
import { useEffect, useRef } from 'react';

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
// One Tap is shown once per page load: asking again while a request is pending makes Google
// abort the first one and log a FedCM AbortError (also seen when the user dismisses it).
let prompted = false;

type GoogleId = {
  initialize: (o: { client_id: string; context: 'signin' | 'signup'; callback: (r: { credential: string }) => void }) => void;
  renderButton: (el: HTMLElement, o: Record<string, string | number>) => void;
  prompt: () => void;
};
declare global {
  interface Window { google?: { accounts: { id: GoogleId } } }
}

// Google's official "Sign in with Google" button plus One Tap, always in English. Hidden until a client ID is configured.
// On sign-up pages Google's personalized button can't say "Sign up as", so it says "Continue as <name>".
export function GoogleButton({ signup = false, onCredential }: { signup?: boolean; onCredential: (credential: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  useEffect(() => { callback.current = onCredential; });

  if (!CLIENT_ID) return null;
  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client?hl=en"
        strategy="afterInteractive"
        onReady={() => {
          const id = window.google?.accounts.id;
          if (!id || !el.current) return;
          id.initialize({ client_id: CLIENT_ID, context: signup ? 'signup' : 'signin', callback: (r) => callback.current(r.credential) });
          id.renderButton(el.current, { theme: 'outline', size: 'large', text: signup ? 'continue_with' : 'signin_with', shape: 'rectangular', locale: 'en', width: Math.min(400, el.current.offsetWidth) });
          if (!prompted) { prompted = true; id.prompt(); }
        }}
      />
      <div ref={el} className="flex min-h-11 w-full justify-center" />
    </>
  );
}
