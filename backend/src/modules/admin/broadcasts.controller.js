// Admin › Announcements.
import { bad, str } from '../../lib/validate.js';
import { hooks } from '../../services/hooks.js';
import { logAdmin } from './admin.service.js';
import * as Broadcasts from './broadcasts.model.js';
import { announcement } from './broadcasts.service.js';

export const overview = async (req, res) => {
  res.json({ counts: await Broadcasts.countReachable(), history: await Broadcasts.listHistory(), test_to: process.env.ADMIN_EMAIL ?? null });
};

// `test: true` sends one copy to the admin. A real send must repeat the recipient count the admin was shown,
// so a stale page or a double click can't send to people they didn't expect; the same email isn't sent twice in 10 minutes.
// ponytail: sends inside the request (100 per call, ~1s per 1,000 people); move to a queue past ~20,000 recipients.
export const send = async (req, res) => {
  const audience = req.body?.audience;
  const subject = str(req.body?.subject, 150);
  const body = str(req.body?.body, 5000);
  if (!Broadcasts.AUDIENCES[audience]) return bad(res, 'Choose who gets it');
  if (!subject) return bad(res, 'Add a subject');
  if (body.length < 10) return bad(res, 'Write the message');
  if (req.body?.test === true) {
    if (!process.env.ADMIN_EMAIL) return res.status(503).json({ error: 'ADMIN_EMAIL isn’t set, so there’s nowhere to send a test.' });
    await hooks.sendEmail(announcement({ id: 0, name: 'Admin', email: process.env.ADMIN_EMAIL }, `[Test] ${subject}`, body));
    return res.json({ test: true, to: process.env.ADMIN_EMAIL });
  }
  const people = await Broadcasts.listRecipients(audience);
  if (!people.length) return bad(res, 'Nobody to send to yet');
  if (req.body?.confirm !== people.length) return res.status(409).json({ error: `The number of people changed to ${people.length}. Check and send again.`, count: people.length });
  if (await Broadcasts.sentRecently(subject, body))
    return res.status(409).json({ error: 'This exact email was just sent. Wait 10 minutes to send it again.' });
  const id = await Broadcasts.create({ audience, subject, body, recipients: people.length });
  let sent = 0, failed = 0;
  for (let i = 0; i < people.length; i += 100) {
    const batch = people.slice(i, i + 100);
    try { await hooks.sendBatch(batch.map((u) => announcement(u, subject, body))); sent += batch.length; }
    catch (err) { console.error(err); failed += batch.length; }
    await Broadcasts.saveProgress(id, sent, failed);
  }
  await Broadcasts.finish(id);
  logAdmin(`Emailed ${audience}`, null, `${subject} (${sent} sent${failed ? `, ${failed} failed` : ''})`);
  res.status(201).json({ id, sent, failed });
};
