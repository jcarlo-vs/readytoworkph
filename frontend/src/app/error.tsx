'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { StatusPage } from '@/components/StatusPage';
import { button, buttonGhost } from '@/components/styles';

// Shown when a page crashes while rendering. The header and footer stay, and "Try again" reloads just this page.
export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    // After a new version goes live, an already-open page can ask for files that no longer exist.
    // Reloading once fetches the new version; the flag stops a reload loop if something else is wrong.
    if (error instanceof Error && /ChunkLoadError|Failed to load chunk/.test(`${error.name} ${error.message}`)) {
      try {
        if (!sessionStorage.getItem('reloadedForUpdate')) { sessionStorage.setItem('reloadedForUpdate', '1'); location.reload(); }
      } catch { /* storage unavailable: show the page below */ }
    }
  }, [error]);
  return (
    <StatusPage code="Oops" title="Something went wrong" text="This page ran into a problem. It’s usually temporary, so please try again. Your account and data are safe.">
      <button type="button" onClick={() => retry()} className={button}>Try again</button>
      <Link href="/" className={buttonGhost}>Go to homepage</Link>
    </StatusPage>
  );
}
