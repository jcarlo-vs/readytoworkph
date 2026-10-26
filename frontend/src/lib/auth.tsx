'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, ApiError, type User } from './api';

type Auth = {
  user: User | null;
  ready: boolean;
  signIn: (user: User) => void;
  signOut: () => void;
};

const AuthContext = createContext<Auth>(null as unknown as Auth);
export const useAuth = () => useContext(AuthContext);

// Remembers only *that* someone signed in on this browser (not the login itself, which is an HttpOnly
// cookie scripts can't read), so visitors don't make a pointless "who am I?" request on every page.
const FLAG = 'signedIn';
const flag = (on: boolean) => { try { if (on) localStorage.setItem(FLAG, '1'); else localStorage.removeItem(FLAG); } catch { /* storage unavailable */ } };
const flagged = () => { try { return localStorage.getItem(FLAG) === '1'; } catch { return true; } };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try { localStorage.removeItem('token'); } catch { /* old token storage, no longer used */ }
    (flagged() ? api<User>('/me', { quiet: true }) : Promise.resolve(null))
      // Only a rejected login (401) signs you out; a blocked request or a network blip keeps you signed in.
      .then(setUser, (err) => { if (err instanceof ApiError && err.status === 401) flag(false); })
      .finally(() => setReady(true));
  }, []);

  // Email sign-ups enter their 6-digit code before anything else (the API refuses them too). Legal pages,
  // Contact us and the admin panel (its own login) stay open.
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (user?.email_verified === false && !/^\/(verify-email|contact|privacy|terms|refunds|unsubscribe|admin)(\/|$)/.test(path))
      router.replace(`/verify-email?next=${encodeURIComponent(path)}`);
  }, [user, path, router]);

  const signIn = (u: User) => { flag(true); setUser(u); };
  const signOut = () => { api('/auth/logout', { method: 'POST', quiet: true }).catch(() => {}); flag(false); setUser(null); };

  return <AuthContext.Provider value={{ user, ready, signIn, signOut }}>{children}</AuthContext.Provider>;
}
