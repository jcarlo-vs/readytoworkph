import type { Metadata } from 'next';

// Kept out of search results: Profiles are for signed-in employers; visitors only see a sign-in prompt.
export const metadata: Metadata = { title: 'Hire talent', robots: { index: false, follow: true } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
