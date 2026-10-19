import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, Section, Mail, OPERATOR } from '@/components/Legal';

export const metadata: Metadata = { title: 'Terms of Service | ReadyToWork.ph' };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={`These terms are the agreement between you and ${OPERATOR} ("ReadyToWork.ph", "we", "us") for using readytowork.ph. By creating an account or using the site, you agree to them. If you don't agree, please don't use ReadyToWork.ph.`}
    >
      <Section title="What ReadyToWork.ph is">
          <p>ReadyToWork.ph is a job board that connects employers with Filipino remote workers. Employers post jobs and review applicants. Workers create profiles and apply. Employers and workers then agree on the work and pay directly with each other.</p>
          <p>We are not an employer, agency or party to any work agreement made through the site. We don&apos;t guarantee that any job will be filled, that any applicant will be hired, or that any employer or worker will behave as promised. Please use your own judgment before agreeing to work or sending payment.</p>
      </Section>
      <Section title="Your account"><ul>
          <li>You must be at least 18 years old to use ReadyToWork.ph.</li>
          <li>Give accurate information and keep it up to date. One person per account.</li>
          <li>Keep your password safe. You are responsible for what happens under your account.</li>
          <li>Worker and employer accounts are separate. Use the account type that matches what you are doing.</li>
        </ul></Section>
      <Section title="Rules for everyone">
          <p>You agree not to:</p>
          <ul>
            <li>Post fake, misleading or illegal jobs, or jobs that are really schemes, pyramid selling or recruitment for unpaid work.</li>
            <li>Ask workers to pay you anything to apply, train, get hired or receive work.</li>
            <li>Ask for passwords, bank logins, one-time codes or other sensitive personal information through messages.</li>
            <li>Harass, threaten, discriminate against or spam other users.</li>
            <li>Copy or scrape the site, its listings or its profiles, or use bots to access it.</li>
            <li>Try to break, overload or get around the security of the site.</li>
          </ul>
          <p>We may remove content, limit features or close accounts that break these rules, with or without notice.</p>
      </Section>
      <Section title="Your content">
          <p>You own what you post: job descriptions, profiles, resumes, photos and messages. You give us permission to store, display and process it as needed to run ReadyToWork.ph, for example to show your job to workers or your application to the employer you applied to.</p>
          <p>Only post content you have the right to share, and nothing that is unlawful or that breaks someone else&apos;s rights.</p>
      </Section>
      <Section title="Credits"><p>Workers receive free daily Credits to show interest in jobs. Credits have no cash value, cannot be sold, transferred or exchanged for money, and reset as described on the site.</p></Section>
      <Section title="Paid plans for employers">
          <p>Employers can use ReadyToWork.ph for free or subscribe to a paid plan. Plan features and prices are listed on our <Link href="/pricing">pricing page</Link>. Prices are in US dollars.</p>
          <p>Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for all our orders. Paddle provides all customer service inquiries and handles returns. Your payment is also subject to Paddle&apos;s buyer terms, which you will see at checkout.</p>
          <ul>
            <li>Subscriptions renew automatically each month or year, depending on what you chose, until you cancel.</li>
            <li>You can cancel anytime. Your plan stays active until the end of the period you paid for, then your account moves back to the Free plan. You keep your jobs, applicants and messages.</li>
            <li>Applicable taxes are calculated and collected at checkout.</li>
            <li>If we change a plan&apos;s price, we will tell you before it applies to your next renewal.</li>
            <li>Refunds follow our <Link href="/refunds">Refund Policy</Link>.</li>
          </ul>
      </Section>
      <Section title="AI Fit Score"><p>The AI Fit Score gives a score and notes to help employers review applicants faster. It can be wrong or incomplete. It is a suggestion, not a hiring decision, and employers remain responsible for who they hire. Application details are sent to our AI provider only to produce the analysis an employer asks for.</p></Section>
      <Section title="Closing your account"><p>You can stop using ReadyToWork.ph at any time and ask us to delete your account by emailing <Mail />. We may suspend or close accounts that break these terms or put other users at risk.</p></Section>
      <Section title="No warranty"><p>ReadyToWork.ph is provided &quot;as is&quot;. We work hard to keep it running and safe, but we can&apos;t promise it will always be available, error-free or that listings and profiles are accurate. We don&apos;t verify every employer, worker or job.</p></Section>
      <Section title="Limitation of liability"><p>To the extent the law allows, we are not liable for indirect or consequential losses, or for disputes, payments or work agreements between employers and workers. Our total liability to you for any claim is limited to the amount you paid us in the 12 months before the claim.</p></Section>
      <Section title="Changes to these terms"><p>We may update these terms as ReadyToWork.ph grows. If a change is important, we will tell you by email or on the site before it takes effect. Continuing to use ReadyToWork.ph after that means you accept the new terms.</p></Section>
      <Section title="Law and contact"><p>These terms are governed by the laws of the Republic of the Philippines. Questions? Email <Mail />.</p></Section>
    </LegalPage>
  );
}
