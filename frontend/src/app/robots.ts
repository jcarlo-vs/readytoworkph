import type { MetadataRoute } from 'next';

// Search engines may read public pages; private and account pages stay out of results.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/admin', '/dashboard', '/messages', '/profile', '/reset-password', '/forgot-password'] }],
    sitemap: 'https://readytowork.ph/sitemap.xml',
    host: 'https://readytowork.ph',
  };
}
