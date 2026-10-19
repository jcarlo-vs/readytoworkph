import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, Section, Mail } from '@/components/Legal';

export const metadata: Metadata = { title: 'Refund Policy | ReadyToWork.ph' };

export default function RefundsPage() {
  return (
    <LegalPage
      title="Refund Policy"
      intro="ReadyToWork.ph is free for workers and free to start for employers. This policy covers refunds for paid employer plans (Pro and Premium)."
    >
      <Section title="14-day refund on your first payment">
          <p>If you subscribe to a paid plan for the first time and it isn&apos;t right for you, ask for a refund within <strong>14 days</strong> of that first payment and you&apos;ll get your money back in full. This applies to both monthly and yearly plans.</p>
          <p>After a refund, your account moves back to the Free plan. Your jobs, applicants and messages stay.</p>
      </Section>
      <Section title="Renewals"><p>Renewal payments aren&apos;t refunded, but you can cancel anytime before your next renewal and you won&apos;t be charged again. When you cancel, your plan stays active until the end of the period you already paid for.</p></Section>
      <Section title="How to ask for a refund"><ul>
          <li>Email <Mail /> from the email address on your account, or</li>
          <li>Reply to your payment receipt, or visit <a href="https://paddle.net" target="_blank" rel="noopener noreferrer">paddle.net</a> to find your order.</li>
        </ul></Section>
      <Section title="Who processes refunds"><p>Payments are handled by our online reseller Paddle.com, the Merchant of Record for all our orders. Approved refunds are returned by Paddle to the original payment method, usually within 5 to 10 business days depending on your bank.</p></Section>
      <Section title="Questions"><p>If something went wrong with a payment, email <Mail /> and we&apos;ll sort it out. See also our <Link href="/terms">Terms of Service</Link>.</p></Section>
    </LegalPage>
  );
}
