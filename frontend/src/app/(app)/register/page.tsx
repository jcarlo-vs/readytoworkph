import type { Metadata } from 'next';
import { AuthForm } from '@/components/AuthForm';

// Useful to visitors, not as a search result: the homepage is what Google should show.
export const metadata: Metadata = { title: 'Sign up', robots: { index: false, follow: true } };

export default function Page() {
  return <AuthForm mode="register" />;
}
