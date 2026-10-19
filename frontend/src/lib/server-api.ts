import { cache } from 'react';
import { headers } from 'next/headers';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { Job } from './api';

// Calls the backend from the server, for pages search engines read. On the live site it goes straight
// to Cloud Run with the origin secret (like the Worker does); in development, to the local backend.
// No login cookie is sent, so pages are rendered as a visitor (and Google) sees them.
async function serverApi<T>(path: string): Promise<T | null> {
  const dev = process.env.NODE_ENV === 'development';
  const env = dev ? null : (getCloudflareContext().env as unknown as { API_ORIGIN: string; ORIGIN_SECRET: string });
  const visitor = (await headers()).get('cf-connecting-ip') ?? '';
  const res = await fetch(`${dev ? 'http://localhost:4000' : env!.API_ORIGIN}/api${path}`, {
    cache: 'no-store',
    headers: env ? { 'x-origin-secret': env.ORIGIN_SECRET, 'x-visitor-ip': visitor } : {},
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${res.status} for ${path}`);
  return res.json();
}

// cache(): the job page and its <title> share one request.
export const getJob = cache((id: string) => (/^\d+$/.test(id) ? serverApi<Job>(`/jobs/${id}`) : Promise.resolve(null)));
export const getSitemapJobs = () => serverApi<{ id: number; updated_at: string }[]>('/jobs/sitemap');
