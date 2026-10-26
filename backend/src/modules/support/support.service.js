// Feedback and support email rules.

// Anyone can tell us what to improve, signed in or not. Each message is saved for the admin panel and
// emailed to support so nothing gets missed.
export const FEEDBACK_TYPES = { idea: 'Idea', bug: 'Something broke', other: 'Other' };

export const FEEDBACK_MAX = 2000;

// Emails sent to support@, handed over by the site's Cloudflare Worker (its email handler) with their own secret,
// since anyone can reach /api through the site. A reply to one of our answers ("[#12]" in the subject, from the
// same address) joins that ticket and reopens it; anything else starts a new ticket. Mail from our own domain
// (the copies of form submissions we send to support@) and bounces are skipped; a redelivery isn't added twice.
export const OWN_DOMAIN = /@(?:[a-z0-9-]+\.)*readytowork\.ph$/i;

export const BOUNCE = /^(mailer-daemon|postmaster|no-?reply)@/i;

// The new part of an email reply, without the quoted conversation below it.
export const newPart = (text) => String(text ?? '').replace(/\r\n/g, '\n')
  .split(/\n(?:On .{5,200}wrote:|-{2,}\s*Original Message\s*-{2,}|From: .+\nSent: .+)/i)[0]
  .split('\n').filter((l) => !l.startsWith('>')).join('\n').trim();
