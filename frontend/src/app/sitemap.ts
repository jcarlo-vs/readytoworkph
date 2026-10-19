import type { MetadataRoute } from 'next';
import { getSitemapJobs } from '@/lib/server-api';

const SITE = 'https://readytowork.ph';
export const dynamic = 'force-dynamic'; // new jobs show up right away

// Every public page plus every open job, so Google finds new jobs quickly.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const jobs = (await getSitemapJobs().catch(() => null)) ?? [];
  return [
    { url: SITE, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE}/jobs`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${SITE}/pricing`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE}/register`, changeFrequency: 'yearly', priority: 0.5 },
    ...['terms', 'privacy', 'refunds'].map((p) => ({ url: `${SITE}/${p}`, changeFrequency: 'yearly' as const, priority: 0.2 })),
    ...jobs.map((j) => ({ url: `${SITE}/jobs/${j.id}`, lastModified: new Date(j.updated_at), changeFrequency: 'weekly' as const, priority: 0.8 })),
  ];
}
