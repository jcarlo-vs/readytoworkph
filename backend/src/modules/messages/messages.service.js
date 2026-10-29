// Messaging rules (who may write to whom) and delivering a message with its email.
import { PLAN_LIMITS, SITE } from '../../config.js';
import { pool } from '../../db/index.js';
import { num } from '../../lib/validate.js';
import { hooks } from '../../services/hooks.js';
import { renderEmail } from '../../services/mail.js';
import { findContact } from '../../models/users.model.js';
import { planOf } from '../../services/plans.js';
import { getSettings } from '../../services/settings.js';
import * as Messages from './messages.model.js';

// The admin writes to one person; it arrives in their Messages from the Team account, with the usual "new message"
// email, and their replies come back here. Same delivery as any message (one email per unread burst).
export const teamUser = Messages.findTeam;

// Which of this employer's jobs a worker applied to, newest first, within what their plan lets them see.
// Shown in Messages so the employer knows what each conversation is about.
export async function appliedToMe(employerId, workerIds) {
  const limit = PLAN_LIMITS[await planOf(pool, employerId)].applicants;
  const rows = await Messages.applicationsTo(employerId, workerIds, limit);
  const by = {};
  for (const { worker_id, ...r } of rows) (by[worker_id] ??= []).push(r);
  return by;
}

// The other person, if messaging them is allowed at all (employer <-> worker only).
export async function counterpart(me, otherId) {
  const other = await Messages.findPerson(num(otherId));
  return other && other.id !== me.id && other.role !== me.role ? other : null;
}

// Whether Free employers may message at all (Admin › Settings; on while the site is new, so they can try it).
export const freeMessaging = async () => (await getSettings()).free_messaging;

// Workers may only reply to employers who messaged them first. Employers on a paid plan can reach out to
// any worker; on Free, only to workers who applied to one of their jobs, or to keep a conversation going
// (and not at all while Free messaging is off).
export async function canSend(me, other) {
  if (me.role === 'employer') {
    if (PLAN_LIMITS[await planOf(pool, me.id)].outreach) return true;
    return await freeMessaging() && Messages.employerKnowsWorker(me.id, other.id);
  }
  return Messages.hasWritten(other.id, me.id);
}

// Message many applicants at once (the Applicants page): each gets the same text in their own private
// conversation, tagged with the job they applied to. Only applicants the employer's plan lets them see.
export const BULK_MAX = 50;

// Saves one message and emails the recipient, but only when it's worth it:
//  - their first unread message from this sender (a burst of messages sends one email);
//  - not while they're on the site (active in the last 2 minutes: Messages shows it within seconds, and the
//    site stops checking once a tab is hidden or idle, so a forgotten tab doesn't count as being there);
//  - not if they switched message emails off (Account page).
// `job` ({ id, title }) tags the conversation, or null.
export const ONLINE_MINUTES = 2;

export async function deliverMessage(me, other, job, body) {
  const { alreadyUnread, online, wantsEmail } = await Messages.deliveryState(me.id, other.id, ONLINE_MINUTES);
  const message = await Messages.create({ senderId: me.id, recipientId: other.id, jobId: job?.id ?? null, body });
  if (!alreadyUnread && !online && wantsEmail) {
    const sender = await findContact(me.id);
    const preview = body.length > 400 ? `${body.slice(0, 400)}…` : body;
    hooks.sendEmail({
      to: other.email,
      subject: `New message from ${sender.name} on ReadyToWork.ph`,
      ...renderEmail({
        preheader: preview.slice(0, 120),
        greeting: `Hi ${other.name},`,
        intro: [`${sender.name} sent you a message on ReadyToWork.ph${job ? ` about "${job.title}"` : ''}:`],
        quote: preview,
        button: { label: 'Read and reply', url: `${SITE}/messages?with=${me.id}` },
        reason: 'You’re receiving this because someone messaged you on ReadyToWork.ph. We email you once, then wait until you’ve read your messages. To stop these emails, turn off message emails on your Account page.',
      }),
    }).catch((err) => console.error(err));
  }
  return message;
}
