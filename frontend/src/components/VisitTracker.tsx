'use client';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { API } from '@/lib/api';

// Reports homepage visits only (Admin › Visitors), once per tab, with the other site the visitor came from.
// Other pages aren't sent, which keeps the history small. The server adds the IP and country.
const SENT = 'rp:visit';
export function VisitTracker() {
  const path = usePathname();
  useEffect(() => {
    if (path !== '/') return;
    try { if (sessionStorage.getItem(SENT)) return; sessionStorage.setItem(SENT, '1'); } catch { /* storage off: count each page */ }
    let referrer = '';
    try { if (document.referrer && new URL(document.referrer).origin !== location.origin) referrer = document.referrer; } catch { /* bad referrer */ }
    fetch(`${API}/track`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path, referrer }), keepalive: true })
      .catch(() => {}); // counting visits must never get in the way
  }, [path]);
  return null;
}
