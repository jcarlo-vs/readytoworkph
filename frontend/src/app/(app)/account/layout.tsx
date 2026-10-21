import type { Metadata } from 'next';

// Kept out of search results: Private account page.
export const metadata: Metadata = { title: 'Account settings', robots: { index: false, follow: true } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
