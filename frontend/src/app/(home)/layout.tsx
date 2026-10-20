import type { Metadata } from 'next';

// Only the homepage says it's the canonical "/" (the root layout would hand that to every page).
export const metadata: Metadata = { alternates: { canonical: '/' }, openGraph: { url: '/' } };

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
