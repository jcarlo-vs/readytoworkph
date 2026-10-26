// Admin › Users: find, view, fix, suspend, delete, and log in as.
import { PLAN_LIMITS } from '../../config.js';
import { like, pageOf, sizeOf } from '../../lib/paging.js';
import { hashToken } from '../../lib/security.js';
import { bad, num } from '../../lib/validate.js';
import { startAdminViewSession } from '../../middleware/auth.js';
import { deleteAccount } from '../account/account.service.js';
import { sendVerification } from '../auth/auth.service.js';
import * as Admin from './admin.model.js';
import { adminTarget, logAdmin } from './admin.service.js';

// Suspend (or lift it): signs them out everywhere, hides them and their jobs, and blocks their email from
// signing up again. Lifting it removes the block; they can log in again.
export const suspend = async (req, res) => {
  const on = req.body?.suspended === true;
  const u = await Admin.setSuspended(num(req.params.id), on);
  if (!u) return res.status(404).json({ error: 'User not found' });
  await (on ? Admin.blockEmail : Admin.unblockEmail)(hashToken(u.email));
  logAdmin(on ? 'Suspended' : 'Lifted the suspension', num(req.params.id));
  res.json({ suspended_at: u.suspended_at });
};

// Everyone, newest first; search by name or email, filter by role or plan.
export const list = async (req, res) => {
  const role = ['worker', 'employer'].includes(req.query.role) ? req.query.role : '';
  const plan = ['free', 'pro', 'premium'].includes(req.query.plan) ? req.query.plan : '';
  const { users, total } = await Admin.listUsers({ search: like(req.query.q), role, plan, offset: pageOf(req) * sizeOf(req), size: sizeOf(req) });
  res.json({ users, total, page_size: sizeOf(req) });
};

// "Log in as": opens any worker's or employer's account in the admin's browser, no password needed, to see and do
// exactly what they can. The login lasts 2 hours, is noted in their admin history, and doesn't make them look active.
export const loginAs = async (req, res) => {
  const user = await Admin.findPerson(num(req.params.id));
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.suspended) return res.status(409).json({ error: 'This account is suspended. Lift the suspension first to log in as them.' });
  startAdminViewSession(req, res, user);
  logAdmin('Logged in as', user.id);
  res.status(204).end();
};

export const get = async (req, res) => {
  const user = await Admin.findDetail(num(req.params.id));
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user, ...(await Admin.findActivity(user.id, user.email)) });
};

// Someone can't get the 6-digit code (typo'd inbox, spam filter): confirm their email by hand.
export const confirmEmail = async (req, res) => {
  const u = await adminTarget(req, res);
  if (!u) return;
  if (u.email_verified_at) return res.status(409).json({ error: 'This email is already confirmed.' });
  await Admin.confirmEmail(u.id);
  logAdmin('Confirmed the email by hand', u.id, u.email);
  res.status(204).end();
};

// A fresh code now (no once-a-minute wait for the admin).
export const resendCode = async (req, res) => {
  const u = await adminTarget(req, res);
  if (!u) return;
  if (u.email_verified_at) return res.status(409).json({ error: 'This email is already confirmed.' });
  await sendVerification(u);
  logAdmin('Sent a new confirmation code', u.id, u.email);
  res.status(204).end();
};

// Give or take a plan by hand (a partner, a refund, a test). Not for Paddle subscribers: Paddle's next
// update would put their paid plan back, so that's changed in Paddle instead.
export const setPlan = async (req, res) => {
  const u = await adminTarget(req, res);
  if (!u) return;
  const plan = req.body?.plan;
  if (!PLAN_LIMITS[plan]) return bad(res, 'Plan must be free, pro or premium');
  if (u.role !== 'employer') return bad(res, 'Only employers have plans');
  if (u.paddle_subscription_id) return res.status(409).json({ error: 'This employer pays through Paddle. Change or cancel their subscription in Paddle; it updates the plan here by itself.' });
  if (u.plan === plan) return res.json({ plan });
  await Admin.setPlan(u.id, plan);
  logAdmin('Changed the plan', u.id, `${PLAN_LIMITS[u.plan].name} → ${PLAN_LIMITS[plan].name}`);
  res.json({ plan });
};

// Delete an account when the person asks (Data Privacy Act), exactly as "Delete my account" does.
export const remove = async (req, res) => {
  const u = await adminTarget(req, res);
  if (!u) return;
  if (req.body?.confirm !== 'DELETE') return bad(res, 'Type DELETE to confirm');
  const failed = await deleteAccount(u.id);
  if (failed) return res.status(502).json({ error: failed });
  logAdmin('Deleted the account', u.id, `${u.name} <${u.email}>`);
  res.status(204).end();
};
