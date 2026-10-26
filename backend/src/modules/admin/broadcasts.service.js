// Announcement emails: who can get them, and the unsubscribe link.
import { createHmac } from 'node:crypto';
import { SITE } from '../../config.js';
import { renderEmail } from '../../services/mail.js';

// Every announcement carries a one-click unsubscribe link (Gmail and Yahoo require it for bulk mail); account
// emails like codes still go to everyone. The link is signed, so nobody can unsubscribe someone else.
export const unsubToken = (id) => createHmac('sha256', process.env.JWT_SECRET).update(`unsubscribe:${id}`).digest('hex').slice(0, 32);

export const announcement = (u, subject, body) => {
  const link = `${SITE}/unsubscribe?u=${u.id}&t=${unsubToken(u.id)}`;
  return {
    to: u.email, subject,
    headers: { 'List-Unsubscribe': `<${SITE}/api/unsubscribe?u=${u.id}&t=${unsubToken(u.id)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    ...renderEmail({
      preheader: body.slice(0, 120), greeting: `Hi ${u.name.split(' ')[0]},`,
      intro: body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
      reason: `You’re receiving this announcement because you have a ReadyToWork.ph account. Don’t want these? Unsubscribe: ${link}`,
    }),
  };
};
