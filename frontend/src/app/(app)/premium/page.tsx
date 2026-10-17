import { redirect } from 'next/navigation';

// Old upgrade page; all plans now live on /pricing.
export default function PremiumPage() {
  redirect('/pricing');
}
