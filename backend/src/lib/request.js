// Who is asking: the visitor's address and country, as Cloudflare reports them.

export const visitor = (req) => req.visitor ?? req.ip;

// Two-letter country (Cloudflare's guess from the IP), or null. Locally there's no Cloudflare, so none.
export const countryOf = (req) => { const c = req.country || req.get('cf-ipcountry'); return /^[A-Z]{2}$/.test(c ?? '') ? c : null; };
