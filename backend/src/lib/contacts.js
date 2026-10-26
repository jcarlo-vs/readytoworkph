// Contact details (emails, links, phone numbers, @handles) found in user text, and hiding them.

// People give a first and last name; an employer may instead give a company name (`name`). A single
// name (older pages) is split at the first space.
// Names show in other people's emails ("Rosa sent you a message"), where mail apps turn web addresses into
// links, so a name may not carry links, emails, phone numbers or @handles (the same check as job post masking).
export const NAME_CONTACT = 'Please use just your name: no links, emails, phone numbers or @handles.';

export const withoutContacts = (s) => hideContacts(s, '').replace(/\s+/g, ' ').trim();

// Contact details in job posts (emails, links, phone numbers, @handles) are only sent to signed-in members.
// Visitors, scrapers and bots get a placeholder instead, in the HTML and in this API alike, so there's
// nothing to un-blur; the page shows it as "Sign up or log in to see".
export const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;

export const MEMBERS_ONLY = '[contact hidden, log in to see it]';

// "Maria Santos" → "Maria S.": how a worker's name shows until an employer may contact them.
export const shortName = (name) => {
  const [first, ...rest] = String(name).trim().split(/\s+/);
  return rest.length ? `${first} ${rest.at(-1)[0].toUpperCase()}.` : first;
};

// Contact details written into a headline or bio (emails, links, phone numbers, @handles) are swapped for
// HIDDEN before the text leaves the server; the page shows a blurred "upgrade to see" in their place.
export const HIDDEN = '[hidden: upgrade to see]';

const CONTACT_RE = new RegExp([
  EMAIL.source,
  String.raw`(?:https?:\/\/|www\.)[^\s,;)]+`, // a link ends at a space, comma, semicolon or bracket
  String.raw`\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|ph|io|dev|me|co|org|app|link|site|xyz|info|biz)(?:\/[^\s,;)]*)?`,
  String.raw`(?:\+?\d[\d\s().-]{7,}\d)`,
  String.raw`(?<![\w.])@[a-z0-9_.]{2,}[a-z0-9_](?![\w.]*@)`, // an @handle (never ending in a full stop), not the start of an email
].join('|'), 'gi');

// Number runs only count as a phone number with 10+ digits, so "2024-2025" or "1,300" stay readable.
const PHONE = /^\+?\d[\d\s().-]{7,}\d$/;

export const hideContacts = (text, mark = HIDDEN) => String(text ?? '').replace(CONTACT_RE,
  (m) => (PHONE.test(m) && m.replace(/\D/g, '').length < 10 ? m : mark));
