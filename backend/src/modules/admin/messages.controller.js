// Admin › Messages: writing to people as the ReadyToWork.ph Team.
import { bad, num, str } from '../../lib/validate.js';
import { isSuspended } from '../auth/auth.model.js';
import * as Messages from '../messages/messages.model.js';
import { deliverMessage, teamUser } from '../messages/messages.service.js';
import { adminTarget, logAdmin } from './admin.service.js';

export const inbox = async (req, res) => {
  const team = await teamUser();
  res.json(await Messages.teamInbox(team.id));
};

// The conversation with one person; opening it marks their replies read.
export const conversation = async (req, res) => {
  const team = await teamUser();
  const id = num(req.params.id);
  await Messages.markRead(id, team.id);
  res.json(await Messages.teamConversation(team.id, id));
};

export const send = async (req, res) => {
  const u = await adminTarget(req, res);
  if (!u) return;
  if (!['worker', 'employer'].includes(u.role)) return bad(res, 'Only workers and employers can be messaged');
  if (await isSuspended(u.id)) return res.status(409).json({ error: 'This account is suspended, so they can’t read messages. Email them instead.' });
  const body = str(req.body?.body, 5000);
  if (!body) return bad(res, 'Write a message');
  const team = await teamUser();
  await deliverMessage(team, { id: u.id, name: u.name, email: u.email }, null, body);
  logAdmin('Sent a message', u.id, body.slice(0, 80));
  res.status(201).json({ ok: true });
};
