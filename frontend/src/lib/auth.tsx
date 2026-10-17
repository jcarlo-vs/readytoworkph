'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, type User } from './api';

type Auth = {
  user: User | null;
  ready: boolean;
  signIn: (token: string, user: User) => void;
  signOut: () => void;
};

const AuthContext = createContext<Auth>(null as unknown as Auth);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (getToken() ? api<User>('/me') : Promise.resolve(null))
      .then(setUser, () => localStorage.removeItem('token'))
      .finally(() => setReady(true));
  }, []);

  const signIn = (token: string, u: User) => { localStorage.setItem('token', token); setUser(u); };
  const signOut = () => { localStorage.removeItem('token'); setUser(null); };

  return <AuthContext.Provider value={{ user, ready, signIn, signOut }}>{children}</AuthContext.Provider>;
}
