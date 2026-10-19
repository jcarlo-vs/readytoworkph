import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { default: 'Remote jobs in the Philippines', template: '%s | ReadyToWork.ph' },
  description: 'Browse work-from-home jobs for Filipino professionals: virtual assistants, developers, designers, customer support and more. Full-time, part-time and project work, paid in dollars.',
  alternates: { canonical: '/jobs' },
};

export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
