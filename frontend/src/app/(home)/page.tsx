import { getHomepage } from '@/lib/server-api';
import Home from './Home';

// Which homepage design and photo to show is a site setting (admin > Settings). If the API is down, the classic one.
// Built on every visit: the setting can change any time, and the build itself can't reach the API (it would
// bake in "classic", then fail at runtime with "Page changed from static to dynamic").
export const dynamic = 'force-dynamic';

export default async function Page() {
  const s = await getHomepage().catch(() => null);
  return <Home design={s?.homepage_design ?? 'classic'} photo={s?.homepage_photo ?? 'laughing'} />;
}
