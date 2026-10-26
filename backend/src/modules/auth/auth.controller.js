// Sign up, log in (password or Google), log out, confirm the email, reset a forgotten password.
import { randomBytes } from 'node:crypto';
import { SITE } from '../../config.js';
import { NAME_CONTACT, withoutContacts } from '../../lib/contacts.js';
import { visitor } from '../../lib/request.js';
import { hashToken } from '../../lib/security.js';
import { bad, str } from '../../lib/validate.js';
import { endSession, hashPassword, startSession, verifyPassword } from '../../middleware/auth.js';
import { notHuman, verifyHuman } from '../../middleware/human.js';
import { limiter, tooMany } from '../../middleware/rateLimit.js';
import { hooks } from '../../services/hooks.js';
import { renderEmail } from '../../services/mail.js';
import * as Users from './auth.model.js';
import { ACCOUNT_TRIES, BLOCKED, CODE_TRIES, LOCK_MINUTES, RESETS_PER_HOUR, SUSPENDED, badPassword, codeWait, isBlocked, nameOf, sendVerification, tooSoon, useCode, welcome } from './auth.service.js';

const loginFails = limiter(10, 15 * 60_000); // wrong passwords per visitor
const signups = limiter(10, 60 * 60_000); // new accounts per visitor

export const register = async (req, res) => {
  if (signups.blocked(visitor(req))) return tooMany(res, 'an hour');
  if (!(await verifyHuman(req))) return notHuman(res);
  const email = str(req.body.email, 200).toLowerCase();
  const { name, first, last, hasContact } = nameOf(req.body);
  const { password, role } = req.body;
  if (!/^\S+@\S+\.\S+$/.test(email)) return bad(res, 'Valid email required');
  if (!name) return bad(res, 'Name required');
  if (hasContact) return bad(res, NAME_CONTACT);
  if (badPassword(password)) return bad(res, badPassword(password));
  if (!['worker', 'employer'].includes(role)) return bad(res, 'Role must be worker or employer');
  if (await isBlocked(email)) return res.status(403).json(BLOCKED);

  const user = await Users.createWithPassword({ email, passwordHash: await hashPassword(password), name, role, first, last });
  if (!user) return res.status(409).json({ error: 'This email already has an account. Log in, or use a different email to create another account.' });
  signups.hit(visitor(req));
  if (role === 'worker') await Users.createWorkerProfile(user.id);
  await sendVerification(user); // the code is saved before the account is handed back; welcome() follows once it's entered
  startSession(req, res, user);
  res.status(201).json({ user });
};

export const login = async (req, res) => {
  if (loginFails.blocked(visitor(req))) return tooMany(res, '15 minutes');
  const user = await Users.findForLogin(str(req.body.email, 200).toLowerCase(), LOCK_MINUTES);
  if (user?.login_locked_until > new Date()) {
    const minutes = Math.ceil((user.login_locked_until - Date.now()) / 60_000);
    return res.status(429).json({ error: `Too many wrong passwords. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or reset your password.`, code: 'locked', minutes });
  }
  const triedBefore = 10 - loginFails.left(visitor(req)) >= 2 || (user?.recent_fails ?? 0) >= 2;
  if (triedBefore && !(await verifyHuman(req))) return notHuman(res);
  // Say exactly what's wrong, with a way forward. (Sign-up already tells people when an email is taken,
  // so naming "no account" here reveals nothing new; the attempt limits still stop password guessing.)
  const fail = (code, error, extra = {}) => {
    loginFails.hit(visitor(req));
    const left = Math.min(loginFails.left(visitor(req)), extra.accountLeft ?? Infinity);
    res.status(401).json({ error, code, attemptsLeft: left, robotCheck: triedBefore || 10 - loginFails.left(visitor(req)) >= 2 || extra.accountTries >= 2 });
  };
  if (!user) return fail('no_account', 'No account uses this email.');
  if (!user.password_hash) return fail('google_account', 'This account signs in with Google. Use the Google button above.');
  if (!(await verifyPassword(String(req.body.password ?? ''), user.password_hash))) {
    const tries = user.recent_fails + 1;
    if (tries >= ACCOUNT_TRIES) {
      await Users.pausePasswordLogin(user.id, LOCK_MINUTES);
      loginFails.hit(visitor(req));
      hooks.sendEmail({
        to: user.email,
        subject: 'Someone tried to log in to your ReadyToWork.ph account',
        ...renderEmail({
          preheader: `${ACCOUNT_TRIES} wrong passwords in a row, so we paused password login for ${LOCK_MINUTES} minutes.`,
          greeting: `Hi ${user.name},`,
          intro: [
            `Someone entered the wrong password for your account ${ACCOUNT_TRIES} times in a row, so we paused logging in with a password for ${LOCK_MINUTES} minutes to keep your account safe.`,
            'If it was you, you can wait or reset your password now (that also ends the pause). If it wasn’t you, your account is safe, and choosing a new password is a good idea.',
          ],
          button: { label: 'Reset my password', url: `${SITE}/forgot-password?email=${encodeURIComponent(user.email)}` },
          reason: 'You’re receiving this because of failed login attempts on your ReadyToWork.ph account.',
        }),
      }).catch((err) => console.error(err));
      return res.status(429).json({ error: `Too many wrong passwords. Try again in ${LOCK_MINUTES} minutes, or reset your password.`, code: 'locked', minutes: LOCK_MINUTES });
    }
    await Users.recordWrongPassword(user.id, tries);
    return fail('wrong_password', 'Incorrect password.', { accountLeft: ACCOUNT_TRIES - tries, accountTries: tries });
  }
  loginFails.clear(visitor(req));
  if (user.suspended_at) return res.status(403).json(SUSPENDED);
  if (user.recent_fails || user.login_locked_until) await Users.clearWrongPasswords(user.id);
  const { id, email, name, role, plan } = user;
  const reactivated = await Users.reactivate(id);
  startSession(req, res, user);
  res.json({ user: { id, email, name, role, plan, has_photo: !!user.photo_key, email_verified: !!user.email_verified_at }, reactivated });
};

export const logout = (req, res) => {
  endSession(req, res);
  res.status(204).end();
};

const resetRequests = limiter(5, 60 * 60_000); // reset emails per visitor per hour

// Always answers the same way, so this can't be used to check which emails have accounts.
export const forgotPassword = async (req, res) => {
  if (resetRequests.blocked(visitor(req))) return tooMany(res, 'an hour');
  if (!(await verifyHuman(req))) return notHuman(res);
  resetRequests.hit(visitor(req));
  const email = str(req.body.email, 200).toLowerCase();
  const user = await Users.findForReset(email);
  if (user) {
    // At most RESETS_PER_HOUR links per account, wherever the requests come from, so nobody can flood someone's
    // inbox. Links live 1 hour, so the unexpired ones are exactly this hour's. Past it: same answer, no email.
    const token = randomBytes(32).toString('base64url');
    if (await Users.createReset(hashToken(token), user.id, RESETS_PER_HOUR)) hooks.sendEmail({
      to: user.email,
      subject: 'Reset your ReadyToWork.ph password',
      ...renderEmail({
        preheader: 'Choose a new password. This link works for 1 hour.',
        greeting: `Hi ${user.name},`,
        intro: ['We got a request to reset the password for your ReadyToWork.ph account. Choose a new one with the button below. The link works once and expires in 1 hour.'],
        button: { label: 'Choose a new password', url: `${SITE}/reset-password?token=${token}` },
        reason: 'You’re receiving this because someone asked to reset your password. If it wasn’t you, ignore this email: your password stays the same.',
      }),
    }).catch((err) => console.error(err));
  }
  res.json({ ok: true });
};

export const verifyEmail = async (req, res) => {
  if (!(await useCode(req, res, 'confirm'))) return;
  const user = await Users.confirmEmail(req.user.id);
  welcome(user); // the welcome email waits until the address is confirmed
  res.json({ user });
};

export const resendCode = async (req, res) => {
  const user = await Users.findForCode(req.user.id);
  if (user.email_verified_at) return res.json({ ok: true, verified: true });
  // `if_none`: the code screen opening. Send one only when there's no live code (accounts from before codes,
  // or back after the 10 minutes ran out), so a reload doesn't replace the code already in their inbox.
  if (req.body?.if_none && (await Users.hasLiveCode(user.id, 'confirm', CODE_TRIES)))
    return res.json({ ok: true, verified: false, sent: false });
  const wait = await codeWait(user.id);
  if (wait) return tooSoon(res, wait);
  await sendVerification(user);
  res.json({ ok: true, verified: false, sent: true });
};

// Typed the wrong email at sign-up: fix it and get a code at the new address. Only before it's confirmed.
export const fixSignupEmail = async (req, res) => {
  if (req.user.verified) return res.status(403).json({ error: 'Your email is already confirmed.' });
  const email = str(req.body?.email, 200).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return bad(res, 'Valid email required');
  if (await isBlocked(email)) return res.status(403).json(BLOCKED);
  let user;
  try {
    user = await Users.setEmail(req.user.id, email);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'This email already has an account. Log in with it instead.' });
    throw err;
  }
  await sendVerification(user);
  res.json({ user });
};

// Sets the new password from a reset link and signs the person in.
export const resetPassword = async (req, res) => {
  const { password } = req.body;
  if (badPassword(password)) return bad(res, badPassword(password));
  const userId = await Users.useReset(hashToken(String(req.body.token ?? '')));
  if (!userId) return res.status(400).json({ error: 'This reset link has expired or was already used. Request a new one.', code: 'invalid_link' });
  const user = await Users.setPassword(userId, await hashPassword(password));
  await Users.deleteResets(user.id); // older links stop working too
  loginFails.clear(visitor(req));
  startSession(req, res, user);
  res.json({ user });
};

export const google = async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'Google sign-in is not configured' });
  let g;
  try {
    g = await hooks.verifyGoogle(String(req.body.credential ?? ''));
  } catch {
    return res.status(401).json({ error: 'Google sign-in failed' });
  }
  if (!g?.email_verified) return res.status(401).json({ error: 'Google account email is not verified' });
  const email = g.email.toLowerCase();

  // Existing account: match on Google ID, else link by verified email.
  let user = await Users.findByGoogle(g.sub);
  // An unconfirmed email sign-up could be anyone's (an address and a password they know). Google proves who
  // owns the address: linking to an unconfirmed account removes that password and signs out every other
  // login (the owner can set a new password with "Forgot password"). Confirmed accounts keep theirs.
  if (!user) {
    user = await Users.linkGoogle(g.sub, email);
    if (user?.had_password) {
      hooks.sendEmail({
        to: user.email,
        subject: 'Your ReadyToWork.ph account now signs in with Google',
        ...renderEmail({
          preheader: 'We linked your Google account and removed the old password.',
          greeting: `Hi ${user.name},`,
          intro: ['You just signed in with Google, so your account now uses Google to log in. To keep it safe, we removed the password it had and signed out other devices.',
            'Want a password too? Use “Forgot password” on the log-in page to set one.'],
          button: { label: 'Log in', url: `${SITE}/login` },
          reason: 'You’re receiving this because the way you log in changed. If this wasn’t you, reply to this email right away.',
        }),
      }).catch((err) => console.error(err));
    }
    if (user) delete user.had_password;
  }
  const { role } = req.body;
  // One account per email, with one role. Signing up as the other role doesn't silently log into this account.
  if (user && role && role !== user.role)
    return res.status(409).json({ error: `This Google account already has a ${user.role === 'worker' ? 'job seeker' : 'employer'} account. To ${role === 'employer' ? 'hire' : 'look for work'}, sign up with a different email.`, existingRole: user.role });
  if (user) {
    if (await Users.isSuspended(user.id)) return res.status(403).json(SUSPENDED);
    const reactivated = await Users.reactivate(user.id);
    startSession(req, res, user);
    return res.json({ user, reactivated });
  }

  if (!['worker', 'employer'].includes(role))
    return res.status(404).json({ error: 'No account yet. Choose how you’ll use ReadyToWork.ph to sign up.', needsRole: true });
  if (await isBlocked(email)) return res.status(403).json(BLOCKED);
  user = await Users.createWithGoogle({
    // Google sends both names; they're whatever the person typed there, so contact bits are dropped (NAME_CONTACT)
    email, name: withoutContacts(str(g.name, 100)) || email.split('@')[0], role, googleSub: g.sub,
    first: withoutContacts(str(g.given_name, 50)), last: withoutContacts(str(g.family_name, 50)),
  });
  if (role === 'worker') await Users.createWorkerProfile(user.id);
  welcome(user);
  startSession(req, res, user);
  res.status(201).json({ user });
};
