// Messages between employers and workers.
import { PLAN_LIMITS } from '../../config.js';
import { pool } from '../../db/index.js';
import { bad, num, str } from '../../lib/validate.js';
import { planOf } from '../../services/plans.js';
import { findTitle } from '../jobs/jobs.model.js';
import * as Messages from './messages.model.js';
import { BULK_MAX, appliedToMe, canSend, counterpart, deliverMessage } from './messages.service.js';

export const inbox = async (req, res) => {
  const rows = await Messages.inbox(req.user.id);
  if (req.user.role === 'employer') {
    const applied = await appliedToMe(req.user.id, rows.map((r) => r.user_id));
    for (const r of rows) r.applied = applied[r.user_id] ?? [];
  }
  res.json(rows);
};

// Remove people from my Messages list (one or many). Nothing is deleted: the other person keeps the chat,
// and a new message from either side brings it back. Their unread messages count as read.
export const hide = async (req, res) => {
  const ids = [...new Set((Array.isArray(req.body?.user_ids) ? req.body.user_ids : []).map(num).filter(Number.isInteger))];
  if (!ids.length) return bad(res, 'Pick at least one conversation');
  if (ids.length > 200) return bad(res, 'You can remove up to 200 conversations at once');
  await Messages.hide(req.user.id, ids);
  res.status(204).end();
};

export const unreadCount = async (req, res) => {
  res.json(await Messages.countUnread(req.user.id));
};

// Opening a conversation marks the other person's messages as read.
export const conversation = async (req, res) => {
  const other = await counterpart(req.user, req.params.userId);
  if (!other) return res.status(404).json({ error: 'Conversation not found' });
  if (!req.user.impersonated) await Messages.markRead(other.id, req.user.id); // the admin looking ("Log in as") leaves them unread
  const rows = await Messages.conversation(req.user.id, other.id);
  // Employers see the worker's side panel: their headline, rate and every application to this employer.
  const employerView = req.user.role === 'employer' && other.role === 'worker';
  const applied = employerView ? (await appliedToMe(req.user.id, [other.id]))[other.id] ?? [] : undefined;
  const profile = employerView ? (await Messages.workerHeadline(other.id)) ?? {} : {};
  res.json({ user: { id: other.id, name: other.name, role: other.role, status: other.status, ...profile }, can_send: !other.status && await canSend(req.user, other), messages: rows, applied });
};

export const bulk = async (req, res) => {
  const body = str(req.body?.body, 5000);
  const ids = [...new Set((Array.isArray(req.body?.application_ids) ? req.body.application_ids : []).map(num).filter(Number.isInteger))];
  if (!body) return bad(res, 'Message can’t be empty');
  if (!ids.length) return bad(res, 'Pick at least one applicant');
  if (ids.length > BULK_MAX) return bad(res, `You can message up to ${BULK_MAX} applicants at once`);
  const limit = PLAN_LIMITS[await planOf(pool, req.user.id)].applicants;
  const rows = await Messages.bulkRecipients(ids, req.user.id, limit);
  const sent = [], skipped = [];
  for (const r of rows) {
    if (r.status) { skipped.push({ name: r.status === 'deleted' ? 'Deleted user' : r.name, reason: r.status === 'deactivated' ? 'paused their account' : 'can’t get messages' }); continue; }
    await deliverMessage(req.user, { id: r.worker_id, name: r.name, email: r.email }, { id: r.job_id, title: r.job_title }, body);
    sent.push(r.worker_id);
  }
  res.status(201).json({ sent: sent.length, skipped });
};

export const send = async (req, res) => {
  const other = await counterpart(req.user, req.params.userId);
  if (!other || other.status === 'deleted') return res.status(404).json({ error: 'You can only message employers or workers on ReadyToWork.ph' });
  if (other.status) return res.status(403).json({ error: other.status === 'suspended' ? 'This account has been suspended.' : `${other.name} has paused their account, so they can’t get new messages right now.` });
  const body = str(req.body.body, 5000);
  if (!body) return bad(res, 'Message can’t be empty');
  if (!(await canSend(req.user, other))) return res.status(403).json(req.user.role === 'employer'
    ? { error: 'On the Free plan you can message workers who applied to your jobs. Upgrade to Pro to reach out to any worker first.', upgrade: true }
    : { error: 'You can reply once this employer messages you' });

  let job = null;
  if (req.body.job_id != null) {
    const employerId = req.user.role === 'employer' ? req.user.id : other.id;
    job = await findTitle(num(req.body.job_id), employerId);
    if (!job) return bad(res, 'That job isn’t part of this conversation');
  }

  const row = await deliverMessage(req.user, other, job, body);
  res.status(201).json({ ...row, job_title: job?.title ?? null });
};
