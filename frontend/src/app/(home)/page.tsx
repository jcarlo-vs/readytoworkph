import { getHomepage } from '@/lib/server-api';
import Home from './Home';

// Which homepage design and photo to show is a site setting (admin > Settings). If the API is down, the classic one.
export default async function Page() {
  const s = await getHomepage().catch(() => null);
  return <Home design={s?.homepage_design ?? 'classic'} photo={s?.homepage_photo ?? 'laughing'} />;
}
