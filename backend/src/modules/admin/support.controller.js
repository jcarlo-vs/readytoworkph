// Admin › Feedback & support: tickets and replies.
import { bad, num, str } from '../../lib/validate.js';
import { hooks } from '../../services/hooks.js';
import { renderEmail } from '../../services/mail.js';
import * as Support from '../support/support.model.js';

export const list = async (req, res) => {
  res.json(await Support.list());
};

export const setDone = async (req, res) => {
  (await Support.setDone(num(req.params.id), req.body?.done === true)) ? res.status(204).end() : res.status(404).json({ error: 'Feedback not found' });
};

// A ticket's messages in order: what they first wrote, then our replies and their email answers.
export const ticket = async (req, res) => {
  const t = await Support.find(num(req.params.id));
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json({ ...t, messages: await Support.listMessages(t.id) });
};

// Reply by email. Their answer comes back to support@ with "[#id]" in the subject and lands in this ticket.
const ticketSubject = (t) => `Re: ${t.subject || 'Your message to ReadyToWork.ph'} [#${t.id}]`;

export const reply = async (req, res) => {
  const body = str(req.body?.body, 5000);
  if (body.length < 2) return bad(res, 'Write a reply');
  const t = await Support.find(num(req.params.id));
  if (!t) return res.status(404).json({ error: 'Not found' });
  if (!t.email) return res.status(409).json({ error: 'They didn’t leave an email address, so there’s no way to reply.' });
  await hooks.sendEmail({
    to: t.email, subject: ticketSubject(t),
    ...renderEmail({
      preheader: body.slice(0, 120), greeting: `Hi ${t.name ? t.name.split(' ')[0] : 'there'},`,
      intro: body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
      reason: 'You’re receiving this because you contacted ReadyToWork.ph. Just reply to this email to answer us.',
    }),
  }); // sent before saving: a failed email shows as an error, not as a reply they never got
  await Support.addOurReply(t.id, body);
  await Support.setDone(t.id, req.body?.resolve === true);
  res.status(201).json({ ok: true });
};
