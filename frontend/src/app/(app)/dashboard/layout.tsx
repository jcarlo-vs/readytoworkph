'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';

// Everything under /dashboard is for logged-in members: visitors get a log-in link, never the page.
// The API checks too; this just stops the empty page from showing.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const path = usePathname();
  if (!ready) return null;
  if (!user) return <p><Link href={`/login?next=${encodeURIComponent(path)}`} className="text-emerald-700 underline">Log in</Link> to see this page.</p>;
  return children;
}
