'use client';
import { useState } from 'react';
import { input } from './ui';

// Password box with a show/hide eye button, so people can check what they typed.
export function PasswordInput(props: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'>) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={shown ? 'text' : 'password'} className={`${input} pr-11`} />
      <button type="button" onClick={() => setShown(!shown)} aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-slate-700">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {shown
            ? <><path d="M3 3l18 18" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A9.8 9.8 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3 3.9M6.1 6.1C3.8 7.7 2.5 12 2.5 12S6 19 12 19a9.7 9.7 0 0 0 4.2-.9" /></>
            : <><path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" /><circle cx="12" cy="12" r="2.5" /></>}
        </svg>
      </button>
    </div>
  );
}
