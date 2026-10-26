// The signed-in person's own account: name, email change, email preferences, pause, delete.
import { SITE } from '../../config.js';
import { NAME_CONTACT } from '../../lib/contacts.js';
import { bad, str } from '../../lib/validate.js';
import { endSession, startSession, verifyPassword } from '../../middleware/auth.js';
import { hooks } from '../../services/hooks.js';
import { renderEmail } from '../../services/mail.js';
import { findCode } from '../auth/auth.model.js';
import { BLOCKED, codeWait, isBlocked, nameOf, sendCode, tooSoon, useCode } from '../auth/auth.service.js';
import * as Account from './account.model.js';
import { deleteAccount, maskEmail } from './account.service.js';

export const sendReauthCode = async (req, res) => {
  const user = await Account.findWithPassword(req.user.id);
  if (user.password_hash) return bad(res, 'Enter your password instead');
  const wait = await codeWait(user.id);
  if (wait) return tooSoon(res, wait);
  await sendCode(user, 'reauth');
  res.json({ ok: true });
};

export const startEmailChange = async (req, res) => {
  const user = await Account.findWithPassword(req.user.id);
  const email = str(req.body?.email, 200).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return bad(res, 'Valid email required');
  if (email === user.email) return bad(res, 'That’s already your email');
  if (await isBlocked(email)) return res.status(403).json(BLOCKED);
  if (await Account.emailTaken(email))
    return res.status(409).json({ error: 'This email already has an account. Use a different one.' });
  if (user.password_hash) {
    if (!(await verifyPassword(String(req.body?.password ?? ''), user.password_hash)))
      return res.status(401).json({ error: 'Incorrect password.', code: 'wrong_password' });
  } else if (!(await useCode(req, res, 'reauth'))) return;
  await sendCode(user, 'change', email);
  res.json({ ok: true, email });
};

export const resendEmailCode = async (req, res) => {
  const user = await Account.findWithPassword(req.user.id);
  const c = await findCode(user.id, ['reauth', 'change']);
  if (!c) return res.status(400).json({ error: 'Start again: this request has expired.', code: 'expired' });
  const wait = await codeWait(user.id);
  if (wait) return tooSoon(res, wait);
  await sendCode(user, c.purpose, c.purpose === 'change' ? c.new_email : user.email);
  res.json({ ok: true });
};

export const confirmEmailChange = async (req, res) => {
  const before = await Account.findWithPassword(req.user.id);
  const c = await useCode(req, res, 'change');
  if (!c) return;
  let user;
  try {
    user = await Account.changeEmail(req.user.id, c.new_email);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'This email was just used for another account. Use a different one.' });
    throw err;
  }
  startSession(req, res, user); // this device stays signed in; the others are signed out
  hooks.sendEmail({
    to: before.email,
    subject: 'Your ReadyToWork.ph email was changed',
    ...renderEmail({
      preheader: `Your account now signs in with ${maskEmail(user.email)}.`,
      greeting: `Hi ${before.name},`,
      intro: [`The email for your ReadyToWork.ph account was changed to ${maskEmail(user.email)}. From now on, log in and get emails there. We also signed you out on your other devices.`,
        'If this wasn’t you, contact us right away so we can lock the account and help you get it back.'],
      button: { label: 'Contact support', url: `${SITE}/contact` },
      reason: 'You’re receiving this because the email of your ReadyToWork.ph account was changed.',
    }),
  }).catch((err) => console.error(err));
  res.json({ user });
};

export const deleteMe = async (req, res) => {
  if (req.body?.confirm !== 'DELETE') return bad(res, 'Type DELETE to confirm');
  const failed = await deleteAccount(req.user.id);
  if (failed) return res.status(502).json({ error: failed.replace('the subscription at Paddle', 'your subscription') + ' Or contact support.' });
  endSession(req, res);
  res.status(204).end();
};

// Pause my account: hidden from search and new messages, jobs hidden; everything is kept. It signs out every
// device; logging in again (password or Google) reactivates it.
export const deactivate = async (req, res) => {
  await Account.deactivate(req.user.id);
  endSession(req, res);
  res.status(204).end();
};

// Change your name (a worker's first and last name, or an employer's company or own name).
export const updateMe = async (req, res) => {
  const { name, first, last, hasContact } = nameOf(req.body);
  if (!name) return bad(res, 'Name required');
  if (hasContact) return bad(res, NAME_CONTACT);
  res.json(await Account.updateName(req.user.id, { name, first, last }));
};

export const me = async (req, res) => {
  const u = await Account.findMe(req.user.id);
  u ? res.json(u) : res.status(404).json({ error: 'User not found' });
};

// Email preferences (Account page). Only message emails can be switched off; account and security emails always go.
export const setNotifications = async (req, res) => {
  if (typeof req.body?.message_emails !== 'boolean') return bad(res, 'message_emails must be true or false');
  await Account.setMessageEmails(req.user.id, req.body.message_emails);
  res.json({ message_emails: req.body.message_emails });
};
