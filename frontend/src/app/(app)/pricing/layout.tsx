import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing for employers',
  description: 'Post jobs free and hire Filipino remote professionals directly, with no agency markups. Pro and Premium plans for growing teams. Cancel anytime.',
  alternates: { canonical: '/pricing' },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
