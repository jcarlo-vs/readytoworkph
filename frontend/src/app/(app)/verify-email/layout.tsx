import type { Metadata } from 'next';

// Kept out of search results: A one-time link page.
export const metadata: Metadata = { title: 'Confirm your email', robots: { index: false, follow: true } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
