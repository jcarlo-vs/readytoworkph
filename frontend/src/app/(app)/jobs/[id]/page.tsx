import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getJob } from '@/lib/server-api';
import { salary } from '@/lib/format';
import type { Job } from '@/lib/api';
import { JobView } from './JobView';

const SITE = 'https://readytowork.ph';
const TYPE_LABEL: Record<string, string> = { 'full-time': 'Full-time', 'part-time': 'Part-time', gig: 'Project' };

const summary = (text: string, max = 155) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
};

export async function generateMetadata({ params }: PageProps<'/jobs/[id]'>): Promise<Metadata> {
  const job = await getJob((await params).id);
  if (!job) return { title: 'Job not found' };
  const type = TYPE_LABEL[job.job_type] ?? job.job_type;
  const title = /remote/i.test(job.title) ? `${job.title} (${type})` : `${job.title} (Remote, ${type})`;
  const pay = job.salary_min || job.salary_max ? salary(job) : '';
  const description = summary(`${job.employer_name} is hiring${pay ? `, ${pay}` : ''}. ${job.description}`);
  return {
    title,
    description,
    alternates: { canonical: `/jobs/${job.id}` },
    // (setting openGraph here replaces the site-wide one, so the preview image is repeated)
    openGraph: { title, description, url: `/jobs/${job.id}`, type: 'article', siteName: 'ReadyToWork.ph', images: ['/og.png'] },
    // Closed jobs stay viewable for applicants but drop out of search results.
    robots: job.closed_at || job.indexed === false ? { index: false } : undefined,
  };
}

// Google for Jobs: the JobPosting format lets open jobs appear in Google's job search panel.
// https://developers.google.com/search/docs/appearance/structured-data/job-posting
function jobPosting(job: Job) {
  const unit = ({ hour: 'HOUR', month: 'MONTH', year: 'YEAR' } as Record<string, string | undefined>)[job.salary_period]; // fixed-price: no pay range
  const posted = new Date(job.created_at);
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description.split('\n').map((line) => line.replace(/[<>&]/g, (c) => `&#${c.charCodeAt(0)};`)).join('<br>'),
    datePosted: posted.toISOString(),
    validThrough: new Date(posted.getTime() + 60 * 86_400_000).toISOString(),
    employmentType: { 'full-time': 'FULL_TIME', 'part-time': 'PART_TIME', gig: 'CONTRACTOR' }[job.job_type],
    hiringOrganization: { '@type': 'Organization', name: job.employer_name },
    jobLocationType: 'TELECOMMUTE',
    applicantLocationRequirements: { '@type': 'Country', name: 'Philippines' },
    directApply: true,
    url: `${SITE}/jobs/${job.id}`,
    ...(unit && (job.salary_min != null || job.salary_max != null) && {
      baseSalary: {
        '@type': 'MonetaryAmount',
        currency: 'USD',
        value: {
          '@type': 'QuantitativeValue',
          ...(job.salary_min != null && { minValue: Number(job.salary_min) }),
          ...(job.salary_max != null && { maxValue: Number(job.salary_max) }),
          unitText: unit,
        },
      },
    }),
    ...(job.skills.length && { skills: job.skills.join(', ') }),
  };
}

export default async function JobPage({ params }: PageProps<'/jobs/[id]'>) {
  const job = await getJob((await params).id);
  if (!job) notFound();
  return (
    <>
      {!job.closed_at && job.indexed !== false && (
        <script type="application/ld+json"
          // "<" is escaped so text in a job post can never close this script tag.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jobPosting(job)).replace(/</g, '\\u003c') }} />
      )}
      <JobView initial={job} />
    </>
  );
}
