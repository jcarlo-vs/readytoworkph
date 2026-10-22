'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { API } from '@/lib/api';

// Reports each page shown (Admin › Visitors): the path only, never the search terms after "?", and, on the
// first page of a visit, the other site the visitor came from. The server adds the IP and country.
export function VisitTracker() {
  const path = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (path.startsWith('/admin')) return;
    let referrer = '';
    if (first.current) {
      first.current = false;
      try { if (document.referrer && new URL(document.referrer).origin !== location.origin) referrer = document.referrer; } catch { /* bad referrer */ }
    }
    fetch(`${API}/track`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path, referrer }), keepalive: true })
      .catch(() => {}); // counting visits must never get in the way
  }, [path]);
  return null;
}
