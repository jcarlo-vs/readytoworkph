// OpenNext settings for Cloudflare. No incremental cache: pages load their data in the browser,
// so there is nothing server-side to cache yet.
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig();
