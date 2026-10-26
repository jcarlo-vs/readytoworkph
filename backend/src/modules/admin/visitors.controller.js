// Admin › Visitors.
import { isIP } from 'node:net';
import { pageOf, sizeOf } from '../../lib/paging.js';
import { visitor } from '../../lib/request.js';
import { bad, str } from '../../lib/validate.js';
import * as Visits from '../visits/visits.model.js';
import { VISIT_DAYS, VISIT_RANGES, deviceOf } from '../visits/visits.service.js';

export const list = async (req, res) => {
  const range = VISIT_RANGES[req.query.range] ? req.query.range : '30d';
  const period = VISIT_RANGES[range];
  const size = sizeOf(req);
  const { visits, total } = await Visits.list(period, size, pageOf(req) * size);
  res.json({
    totals: await Visits.totals(), countries: await Visits.topCountries(period), pages: await Visits.topPages(period),
    range, keep_days: VISIT_DAYS, my_ip: visitor(req),
    my_ip_ignored: await Visits.isIgnored(visitor(req)),
    ignored: await Visits.listIgnored(),
    total,
    visits: visits.map(({ user_agent, ...v }) => ({ ...v, device: deviceOf(user_agent ?? '') })),
  });
};

// Leave an IP out of Visitors (its whole IPv6 /64), e.g. the admin's own: past visits are hidden too.
export const ignore = async (req, res) => {
  const ip = str(req.body?.ip, 60) || visitor(req); // no IP given: the admin's own
  if (!isIP(ip)) return bad(res, 'That isn’t an IP address');
  res.status(201).json(await Visits.ignore(ip, str(req.body?.label, 60) || null));
};

export const unignore = async (req, res) => {
  (await Visits.unignore(str(req.body?.net, 60))) ? res.status(204).end() : res.status(404).json({ error: 'Not in the list' });
};
