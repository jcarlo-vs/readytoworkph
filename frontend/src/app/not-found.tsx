import type { Metadata } from 'next';
import Link from 'next/link';
import { StatusPage } from '@/components/StatusPage';
import { button, buttonGhost } from '@/components/styles';

export const metadata: Metadata = { title: 'Page not found | ReadyToWork.ph' };

export default function NotFound() {
  return (
    <StatusPage code="404" title="We couldn’t find that page" text="The link may be broken, or the page may have been moved or removed. A job post may also have been deleted by its employer.">
      <Link href="/jobs" className={button}>Browse jobs</Link>
      <Link href="/" className={buttonGhost}>Go to homepage</Link>
    </StatusPage>
  );
}
