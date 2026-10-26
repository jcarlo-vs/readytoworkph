// Feedback, Contact us, emails to support@, and the announcement unsubscribe link.
import { SITE } from '../../config.js';
import { EMAIL } from '../../lib/contacts.js';
import { sameText } from '../../lib/security.js';
import { bad, num, str } from '../../lib/validate.js';
import { signedInUser } from '../../middleware/auth.js';
import { notHuman, verifyHuman } from '../../middleware/human.js';
import { hooks } from '../../services/hooks.js';
import { setAnnouncements } from '../admin/broadcasts.model.js';
import { unsubToken } from '../admin/broadcasts.service.js';
import * as Support from './support.model.js';
import { BOUNCE, FEEDBACK_MAX, FEEDBACK_TYPES, OWN_DOMAIN, newPart } from './support.service.js';

export const feedback = async (req, res) => {
  const type = req.body?.type;
  if (!(type in FEEDBACK_TYPES)) return bad(res, 'Choose Idea, Something broke or Other');
  if (typeof req.body.message === 'string' && req.body.message.trim().length > FEEDBACK_MAX)
    return bad(res, `Please keep it under ${FEEDBACK_MAX.toLocaleString('en-US')} characters`);
  const message = str(req.body.message, FEEDBACK_MAX);
  if (!message) return bad(res, 'Please write a message');
  const me = await signedInUser(req);
  if (!me && !(await verifyHuman(req))) return notHuman(res); // visitors only; signed-in people are known
  const email = me ? null : str(req.body.email, 200) || null;
  if (email && !EMAIL.test(email)) return bad(res, 'That email address doesn’t look right');
  EMAIL.lastIndex = 0; // EMAIL is a global regex; reset it after .test()
  const page = str(req.body.page, 300) || null;
  const contactOk = req.body.contact_ok === true;
  const id = await Support.create({ userId: me?.id, type, message, page, contactOk, email });
  const u = me && await Support.findSender(me.id);
  const from = u ? `${u.name} <${u.email}> (${u.role}${u.role === 'employer' ? `, ${u.plan}` : ''})` : email ? `Visitor <${email}>` : 'Anonymous visitor';
  hooks.sendEmail({
    to: 'support@readytowork.ph',
    subject: `Feedback #${id}: ${FEEDBACK_TYPES[type]}`,
    text: `${FEEDBACK_TYPES[type]} from ${from}\nPage: ${page ?? 'unknown'}\nOK to contact: ${contactOk ? 'yes' : 'no'}\n\n${message}\n\nSee all feedback: ${SITE}/admin`,
  }).catch((err) => console.error(err));
  res.status(201).json({ id });
};

// Contact us: a support request from anyone. It lands in the admin inbox (type "support") and in the
// support mailbox, where Reply goes straight to the person who wrote.
export const contact = async (req, res) => {
  const me = await signedInUser(req);
  const name = str(req.body?.name, 100);
  const email = str(req.body?.email, 200).toLowerCase();
  const subject = str(req.body?.subject, 150);
  const message = str(req.body?.message, 5000);
  if (!name) return bad(res, 'Please enter your name');
  const validEmail = EMAIL.test(email); EMAIL.lastIndex = 0; // EMAIL is a global regex; reset it after .test()
  if (!validEmail) return bad(res, 'Please enter a valid email address so we can reply');
  if (!subject) return bad(res, 'Please add a subject');
  if (message.length < 5) return bad(res, 'Please write a little more so we can help');
  if (!me && !(await verifyHuman(req))) return notHuman(res);
  const id = await Support.create({ userId: me?.id, type: 'support', message, page: str(req.body.page, 300) || null, contactOk: true, email, senderName: name, subject });
  hooks.sendEmail({
    to: 'support@readytowork.ph', replyTo: email,
    subject: `Support #${id}: ${subject}`,
    text: `From: ${name} <${email}>${me ? ` (signed in as ${me.role} #${me.id})` : ' (not signed in)'}\n\n${message}\n\nReply to this email to answer them. All messages: ${SITE}/admin/feedback`,
  }).catch((err) => console.error(err));
  res.status(201).json({ id });
};

// The unsubscribe link (and Gmail's one-click button, which POSTs to the same address). `on: true` subscribes again.
export const unsubscribe = async (req, res) => {
  const id = num(req.query.u ?? req.body?.u);
  const token = String(req.query.t ?? req.body?.t ?? '');
  if (!Number.isInteger(id) || !sameText(token, unsubToken(id))) return res.status(400).json({ error: 'This unsubscribe link isn’t valid.' });
  await setAnnouncements(id, req.body?.on === true);
  res.json({ subscribed: req.body?.on === true });
};

export const inbound = async (req, res) => {
  const secret = process.env.INBOUND_SECRET;
  if (!secret) return res.status(503).json({ error: 'Not set up' });
  if (!sameText(req.get('x-inbound-secret') ?? '', secret)) return res.status(403).json({ error: 'Forbidden' });
  const from = str(req.body?.from, 200).toLowerCase();
  const subject = str(req.body?.subject, 150) || '(no subject)';
  const id = str(req.body?.message_id, 300) || null;
  const text = newPart(req.body?.text).slice(0, 5000) || '(no text: the email may have been only images or attachments)';
  if (!/^\S+@\S+$/.test(from) || OWN_DOMAIN.test(from) || BOUNCE.test(from) || req.body?.auto === true) return res.json({ skipped: true });
  const ticket = Number(subject.match(/\[#(\d+)\]/)?.[1]);
  if (ticket) {
    const t = await Support.findTicketFrom(ticket, from);
    if (t) {
      if (await Support.addTheirReply(t.id, text, id)) await Support.setDone(t.id, false); // they wrote back: open again
      return res.json({ ticket: t.id });
    }
  }
  const created = await Support.create({
    userId: await Support.findUserByEmail(from), type: 'email', message: text, contactOk: true, email: from,
    senderName: str(req.body?.from_name, 100) || null, subject: subject.replace(/^(re|fwd?):\s*/i, ''), inboundId: id,
  });
  res.status(201).json({ ticket: created ?? null });
};
