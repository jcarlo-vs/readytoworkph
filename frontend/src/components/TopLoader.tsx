'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { loadingStore } from '@/lib/api';

// Thin gold line at the very top of the page while API requests or page navigations are in progress.
export function TopLoader() {
  const pathname = usePathname();
  const requests = useSyncExternalStore(loadingStore.subscribe, loadingStore.count, () => 0);
  const [navTarget, setNavTarget] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  // A click on an internal link starts the bar; it stops once the URL path has changed.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element).closest('a');
      if (!a || a.target || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin === location.origin && url.pathname !== location.pathname) setNavTarget(url.pathname);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const active = requests > 0 || (navTarget !== null && navTarget !== pathname);

  // Show right away; linger 400ms after loading ends so even fast loads read as a smooth sweep.
  useEffect(() => {
    const t = setTimeout(() => setVisible(active), active ? 0 : 400);
    return () => clearTimeout(t);
  }, [active]);

  return (
    <div role="progressbar" aria-label="Loading" aria-hidden={!visible}
      className={`pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] overflow-hidden bg-amber-400/25 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}>
      <div className={`h-full w-2/5 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.8)] animate-topload motion-reduce:w-full motion-reduce:animate-none ${visible ? '' : '[animation-play-state:paused]'}`} />
    </div>
  );
}
