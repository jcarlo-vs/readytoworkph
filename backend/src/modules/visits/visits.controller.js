// The website reports homepage visits here.
import { countryOf, visitor } from '../../lib/request.js';
import { str } from '../../lib/validate.js';
import { signedInUser } from '../../middleware/auth.js';
import * as Visits from './visits.model.js';
import { BOT_UA, VISIT_DAYS } from './visits.service.js';

export const track = async (req, res) => {
  const path = str(req.body?.path, 300);
  const ua = str(req.get('user-agent'), 300);
  // Only homepage visits are kept, so the history stays short and readable.
  if (path !== '/' || !ua || BOT_UA.test(ua)) return res.status(204).end();
  const ref = str(req.body?.referrer, 300);
  const me = await signedInUser(req);
  await Visits.record({ ip: visitor(req), country: countryOf(req), path, referrer: /^https?:\/\//.test(ref) ? ref : null, userId: me?.id ?? null, userAgent: ua });
  if (Math.random() < 0.01) Visits.deleteOlderThan(VISIT_DAYS).catch((err) => console.error(err));
  res.status(204).end();
};
