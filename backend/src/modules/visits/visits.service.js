// Website visits (Admin › Visitors): what's recorded. The site reports the first page of each visit (one row per
// visit, not per page; see VisitTracker); the IP and country come from the request.
export const BOT_UA = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python|axios/i;
export const VISIT_DAYS = 183; // about 6 months, the longest period Visitors can show

// The periods Visitors can filter by (countries, where visits start, the list); 30 days unless asked.
export const VISIT_RANGES = { '7d': '7 days', '30d': '30 days', '6m': '183 days' };

// "Mobile · Chrome" from a browser's user-agent text, good enough for a glance.
export const deviceOf = (ua = '') => `${/iPad|Tablet/i.test(ua) ? 'Tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'Mobile' : 'Desktop'} · ${
  /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Other'}`;
