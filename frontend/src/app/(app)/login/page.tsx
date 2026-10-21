import type { Metadata } from 'next';
import { AuthForm } from '@/components/AuthForm';

// Useful to visitors, not as a search result: the homepage is what Google should show.
export const metadata: Metadata = { title: 'Log in', robots: { index: false, follow: true } };

export default function Page() {
  return <AuthForm mode="login" />;
}
