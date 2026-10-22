import type { Metadata } from 'next';
import { LegalPage, Section, Mail, OPERATOR } from '@/components/Legal';

export const metadata: Metadata = { title: 'Privacy Policy' };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={`This policy explains what personal information ReadyToWork.ph, run by ${OPERATOR}, collects, why, who can see it, and the choices you have. We follow the Philippine Data Privacy Act of 2012 (Republic Act No. 10173). We don't sell your personal information.`}
    >
      <Section title="What we collect"><ul>
          <li><strong>Account details:</strong> your name, email address, account type (worker or employer) and password (stored only as a secure hash, never readable). If you sign in with Google, we receive your name, email and Google account ID.</li>
          <li><strong>Worker profile:</strong> title, bio, birth date and gender (employers see your age, never your birth date), skills, rate, availability, optional portfolio and LinkedIn links, profile photo and resume (PDF), including the text we read from it.</li>
          <li><strong>Jobs and applications:</strong> job posts, cover letters, Credits used, Smart Scores and Smart Matching shortlists.</li>
          <li><strong>Messages</strong> between employers and workers.</li>
          <li><strong>Payments:</strong> handled by Paddle. We receive your plan and billing status, never your full card details.</li>
          <li><strong>Technical data:</strong> IP address, country, the pages you open, the site that sent you and your device type. We use it for security, to stop abuse and to count visits. Visit records are deleted after 90 days.</li>
        </ul></Section>
      <Section title="Why we use it"><ul>
          <li>To run ReadyToWork.ph: show jobs, deliver applications, let employers and workers message each other.</li>
          <li>To send emails you need, such as a welcome email and new-message notifications.</li>
          <li>To produce Smart Scores and Smart Matching shortlists when an employer asks for them. Both are made by AI. Smart Matching never uses age, gender, name or photo.</li>
          <li>To keep the site safe: rate limits, spam and fraud prevention.</li>
          <li>To manage paid plans for employers.</li>
        </ul></Section>
      <Section title="Who can see your information"><ul>
          <li><strong>Job posts</strong> and the employer&apos;s name are public.</li>
          <li><strong>Worker profiles</strong> are visible only to signed-in employers.</li>
          <li><strong>Applications</strong> (cover letter, attached resume, profile) are visible only to the employer of the job you applied to.</li>
          <li><strong>Messages</strong> are visible only to the two people in the conversation.</li>
          <li><strong>Profile photos</strong> are shown to other users next to your name.</li>
          <li>Your email address is not shown to other users.</li>
        </ul></Section>
      <Section title="Services that help us run ReadyToWork.ph">
          <p>We share information only with providers that process it on our behalf, under their own security and privacy commitments:</p>
          <ul>
            <li><strong>Google Cloud</strong> (Singapore): runs our servers. <strong>Google</strong> also provides optional sign-in.</li>
            <li><strong>Neon</strong> (Singapore): stores our database.</li>
            <li><strong>Cloudflare</strong>: delivers the website, protects it from attacks, stores resumes and photos privately, and provides privacy-friendly visitor statistics without cookies.</li>
            <li><strong>Anthropic</strong>: the AI behind Smart Scores and Smart Matching. Application and profile content is sent only when an employer asks for one, and only what that employer may already see.</li>
            <li><strong>Resend</strong>: sends our emails.</li>
            <li><strong>Paddle</strong>: processes payments as our Merchant of Record.</li>
          </ul>
          <p>Some of these providers store data outside the Philippines. We may also share information if the law requires it, or to protect users from fraud or harm.</p>
      </Section>
      <Section title="Cookies and storage"><p>We don&apos;t use advertising or tracking cookies. Your browser stores your login session and unsent drafts on your device so the site works. Google sign-in may set its own cookies when you use it.</p></Section>
      <Section title="How long we keep it">
        <p>We keep your information while your account is active. When you replace or remove a resume or photo, the old file is deleted.</p>
        <p><strong>Deactivating</strong> your account (Account settings) hides it and keeps everything, so you can come back by logging in.</p>
        <p><strong>Deleting</strong> your account removes your personal information right away: your name, email, profile, photo, resume and what you wrote in applications. So that employers&apos; records still make sense, they see that an applicant or a hire existed, without who it was, and people you messaged keep their side of the conversation, shown from &ldquo;Deleted user&rdquo;. Copies in our backups are erased within 30 days. We keep only what the law requires, such as payment records held by our payment provider, Paddle.</p>
      </Section>
      <Section title="Your rights">
          <p>Under the Data Privacy Act you can ask to access, correct or delete your personal information, object to its processing, or get a copy of it. You can edit most of your information yourself in your profile. For anything else, email <Mail /> and we will reply within 15 days.</p>
          <p>You can also file a complaint with the National Privacy Commission (privacy.gov.ph).</p>
      </Section>
      <Section title="Security"><p>Connections are encrypted (HTTPS). Passwords are hashed. Resumes and photos are stored privately and opened only through short-lived links. Access to our systems is restricted. No system is perfectly secure, so please use a strong password and never share it.</p></Section>
      <Section title="Children"><p>ReadyToWork.ph is for people aged 18 and over. We don&apos;t knowingly collect information from anyone younger.</p></Section>
      <Section title="Changes and contact"><p>If we make important changes to this policy, we will tell you on the site or by email. Questions or requests: <Mail />.</p></Section>
    </LegalPage>
  );
}
