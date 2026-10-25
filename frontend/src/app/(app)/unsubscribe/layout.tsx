import type { Metadata } from 'next';

// Kept out of search results: the page an announcement's unsubscribe link opens.
export const metadata: Metadata = { title: 'Unsubscribe', robots: { index: false, follow: true } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
