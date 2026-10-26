// Sign-up and login rules: passwords, blocked and suspended accounts, 6-digit email codes, welcome email.
import { randomInt } from 'node:crypto';
import { SITE } from '../../config.js';
import { hideContacts } from '../../lib/contacts.js';
import { hashToken } from '../../lib/security.js';
import { str } from '../../lib/validate.js';
import { hooks } from '../../services/hooks.js';
import { renderEmail } from '../../services/mail.js';
import * as Users from './auth.model.js';

// Welcome email for every new account (email or Google sign-up); sending happens in the background.
export function welcome({ email, name, role }) {
  const site = SITE;
  const worker = role === 'worker';
  const email_ = renderEmail(worker ? {
    preheader: 'Your worker account is ready. Here’s how to land your first remote job.',
    greeting: `Hi ${name},`,
    intro: ['Welcome to ReadyToWork.ph! Your worker account is ready. Here’s how to get hired:'],
    steps: [
      ['Complete your profile', 'Add a professional title, your skills and your rate so employers can find you. A resume helps too.'],
      ['Browse remote jobs', 'Full-time, part-time and gig work from employers around the world.'],
      ['Apply with Credits', 'You get 60 free Credits every day. They’re optional: put more on the jobs you want most and employers see you first.'],
    ],
    button: { label: 'Complete your profile', url: `${site}/profile` },
    reason: 'You’re receiving this because you created a worker account on ReadyToWork.ph.',
  } : {
    preheader: 'Your employer account is ready. Here’s how to make your first hire.',
    greeting: `Hi ${name},`,
    intro: ['Welcome to ReadyToWork.ph! Your employer account is ready. Here’s how to find your next great hire:'],
    steps: [
      ['Post your first job', 'Describe the role, the skills you need and your budget. Posting is free.'],
      ['Review applicants', 'Applicants are sorted by interest, and the Smart Score shows how well each one fits.'],
      ['Message and hire directly', 'Talk to candidates, agree on pay together, and pay them directly. No markups.'],
    ],
    button: { label: 'Post your first job', url: `${site}/jobs/new` },
    reason: 'You’re receiving this because you created an employer account on ReadyToWork.ph.',
  });
  hooks.sendEmail({
    to: email,
    subject: worker ? 'Welcome to ReadyToWork.ph: let’s get you hired' : 'Welcome to ReadyToWork.ph: start hiring Filipino talent',
    ...email_,
  }).catch((err) => console.error(err));
}

// 8 to 200 characters (the cap keeps hashing cheap whatever someone sends). Returns the problem, or ''.
export const badPassword = (p) => (typeof p !== 'string' || p.length < 8 ? 'Password must be at least 8 characters'
  : p.length > 200 ? 'Password must be 200 characters or fewer' : '');

// Suspended accounts can't log in, and their email can't sign up again (kept only as a one-way hash).
export const SUSPENDED = { error: 'This account has been suspended. If you think this is a mistake, contact support@readytowork.ph.', code: 'suspended' };

export const BLOCKED = { error: 'This email can’t be used to create an account. If you think this is a mistake, contact support@readytowork.ph.', code: 'blocked' };
export const isBlocked = (email) => Users.isBlocked(hashToken(email));

// Password guessing is stopped three ways:
//  - per visitor: 10 wrong tries in 15 minutes pauses that visitor (loginFails);
//  - per account: 5 wrong passwords in 15 minutes pauses password login for that account for 15 minutes,
//    from anywhere, and emails the owner. It's in the database, so restarts and server copies don't reset it.
//    Resetting the password lifts the pause, and Google sign-in still works, so nobody can lock a real
//    person out of their own account for long;
//  - after 2 wrong tries (by the visitor or on the account) the robot check is required too.
export const ACCOUNT_TRIES = 5;

export const LOCK_MINUTES = 15;
export const RESETS_PER_HOUR = 3; // reset emails per account per hour

// 6-digit codes, good for 10 minutes and 5 tries; one per account at a time, so asking again replaces the old
// one (at most once a minute). `purpose`: 'confirm' (after an email sign-up), 'reauth' and 'change' (changing a
// confirmed email, below).
export const CODE_TRIES = 5;

const codeHash = (userId, code) => hashToken(`${userId}:${code}`);

const CODE_EMAILS = {
  confirm: () => ({ intro: 'Enter this code on ReadyToWork.ph to confirm your email address. It works for 10 minutes.',
    reason: 'You’re receiving this because this email was used to create a ReadyToWork.ph account. If that wasn’t you, ignore this email.' }),
  reauth: () => ({ intro: 'Enter this code on ReadyToWork.ph to confirm it’s you before changing your account’s email. It works for 10 minutes.',
    reason: 'You’re receiving this because someone asked to change the email of your ReadyToWork.ph account. If it wasn’t you, ignore this email and nothing changes.' }),
  change: () => ({ intro: 'Enter this code on ReadyToWork.ph to make this your new sign-in email. It works for 10 minutes.',
    reason: 'You’re receiving this because someone asked to use this email for their ReadyToWork.ph account. If that wasn’t you, ignore this email.' }),
};

export async function sendCode(user, purpose = 'confirm', to = user.email) {
  const code = String(randomInt(1_000_000)).padStart(6, '0');
  await Users.saveCode({ userId: user.id, codeHash: codeHash(user.id, code), purpose, newEmail: purpose === 'change' ? to : null });
  const { intro, reason } = CODE_EMAILS[purpose]();
  hooks.sendEmail({
    to,
    subject: `${code} is your ReadyToWork.ph code`,
    ...renderEmail({ preheader: `Your code is ${code}. It works for 10 minutes.`, greeting: `Hi ${user.name},`, intro: [intro], code, reason }),
  }).catch((err) => console.error(err));
}

export const sendVerification = (user) => sendCode(user);

// Checks a code for this purpose. Counts the try first, in one statement, so guesses sent all at once still get
// only 5. Answers the request itself when the code is wrong or gone; on success returns the used row.
export async function useCode(req, res, purpose) {
  const c = await Users.tryCode(req.user.id, purpose, CODE_TRIES);
  if (!c) { res.status(400).json({ error: 'This code has expired. Ask for a new one.', code: 'expired' }); return null; }
  const code = String(req.body?.code ?? '').replace(/\D/g, '');
  if (code.length !== 6 || codeHash(req.user.id, code) !== c.code_hash) {
    const left = CODE_TRIES - c.tries;
    res.status(400).json(left > 0
      ? { error: `That code isn’t right. ${left} ${left === 1 ? 'try' : 'tries'} left.`, code: 'wrong_code', attemptsLeft: left }
      : { error: 'Too many wrong codes. Ask for a new one.', code: 'expired' });
    return null;
  }
  await Users.deleteCodes(req.user.id);
  return c;
}

// Seconds until another code may be sent (0 = now).
export const codeWait = Users.secondsUntilNextCode;

export const tooSoon = (res, wait) => res.status(429).json({ error: `Please wait ${wait} seconds before asking for a new code.`, wait });


export function nameOf(body) {
  const name = str(body?.first_name, 50) && str(body?.last_name, 50)
    ? `${str(body.first_name, 50)} ${str(body.last_name, 50)}` : str(body?.name, 100);
  const first = str(body?.first_name, 50) || name.split(' ')[0];
  const last = str(body?.first_name, 50) ? str(body?.last_name, 50) : name.split(' ').slice(1).join(' ');
  return { name, first, last, hasContact: hideContacts(name) !== name };
}
