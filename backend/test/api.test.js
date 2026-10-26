import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

process.env.DATABASE_URL = 'postgres://localhost:5432/remotepinas_test';
delete process.env.TURNSTILE_SECRET; // tests that need the robot check switch it on themselves
const { pool } = await import('../src/db/index.js');
const { app } = await import('../src/app.js');

await pool.query('DROP TABLE IF EXISTS broadcasts, support_messages, admin_actions, ignored_ips, hidden_conversations, page_views, match_runs, blocked_emails, email_verifications, email_codes, hires, saved_workers, feedback, ai_analyses, password_resets, settings, messages, applications, jobs, worker_profiles, users');
// Never send real email from tests, even if .env has a Resend key; tests read `sent` instead.
const sent = [];
// Email-confirmation messages go to every new email sign-up; most tests don't care, so they're left out.
const isCode = (e) => /is your ReadyToWork\.ph code$/.test(e.subject);
const capture = async (e) => { if (!isCode(e)) sent.push(e); };
app.locals.sendEmail = capture;
// In-memory stand-in for R2 so tests never touch real storage.
const files = new Map();
app.locals.storage = {
  put: async (key, body) => { files.set(key, body); },
  remove: async (key) => { files.delete(key); },
  signedUrl: async (key, name) => `https://signed.test/${key}?name=${name}`,
};
// Tests sign up and log in many times from one address; the login test below switches limits back on.
app.locals.relaxedLimits = true;
// Never call the real AI from tests.
app.locals.analyzeApplication = async () => { throw new Error('analyzer not stubbed'); };
app.locals.matchModel = async () => { throw new Error('match model not stubbed'); };
await pool.query(await readFile(new URL('../src/db/schema.sql', import.meta.url), 'utf8'));
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api`;
after(() => { server.close(); pool.end(); });

// Logins travel as HttpOnly cookies, like in a browser. For brevity the helper hands the session
// value back as `body.token`, and `token` sends it again as the user (and admin) cookie.
const asCookie = (token) => ({ cookie: `rw_session=${token}; rw_admin=${token}` });
const sessionFrom = (res) => res.headers.getSetCookie().map((c) => c.match(/^rw_(?:session|admin)=([^;]+)/)?.[1]).find(Boolean);

async function call(path, { token, ...body } = {}, method = Object.keys(body).length ? 'POST' : 'GET') {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token && asCookie(token)) },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });
  const json = res.status === 204 ? null : await res.json();
  // Test accounts confirm their email straight away (posting jobs needs it), unless a test asks not to.
  if (path === '/auth/register' && res.status === 201 && !body.unconfirmed) {
    await pool.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [json.user.id]);
    json.user.email_verified = true;
  }
  const session = sessionFrom(res);
  return { status: res.status, body: session && json ? { ...json, token: session } : json };
}

test('employer posts, worker applies, permissions hold', async () => {
  const emp = await call('/auth/register', { email: 'Boss@Acme.com', password: 'password1', name: 'Acme', role: 'employer' });
  const wrk = await call('/auth/register', { email: 'juan@x.ph', password: 'password1', name: 'Juan', role: 'worker' });
  assert.equal(emp.status, 201);
  assert.equal((await call('/auth/register', { email: 'boss@acme.com', password: 'password1', name: 'X', role: 'worker' })).status, 409);
  assert.equal((await call('/auth/login', { email: 'boss@acme.com', password: 'wrong-pass' })).status, 401);
  assert.equal((await call('/auth/login', { email: 'boss@acme.com', password: 'password1' })).status, 200);

  const job = await call('/jobs', { token: emp.body.token, title: 'React Dev', description: 'Build UIs', skills: 'React, TypeScript', job_type: 'full-time', salary_min: 500, salary_max: 900 });
  assert.equal(job.status, 201);
  assert.deepEqual(job.body.skills, ['react', 'typescript']);
  assert.equal((await call('/jobs', { token: wrk.body.token, title: 'x', description: 'y', job_type: 'full-time' })).status, 403);

  assert.equal((await call('/jobs?skill=react')).body.length, 1);
  assert.equal((await call('/jobs?q=nothing-matches')).body.length, 0);

  const apply = (token) => call(`/jobs/${job.body.id}/apply`, { token, cover_letter: 'Hire me' });
  assert.equal((await apply(wrk.body.token)).status, 201);
  assert.equal((await apply(wrk.body.token)).status, 409);
  assert.equal((await apply(emp.body.token)).status, 403);
  assert.equal((await call('/jobs/99999/apply', { token: wrk.body.token, cover_letter: 'x' })).status, 404);

  const apps = await call(`/jobs/${job.body.id}/applications`, { token: emp.body.token }, 'GET');
  assert.equal(apps.body.applicants[0].name, 'Juan');

  const profile = { token: wrk.body.token, title: 'VA', bio: 'Admin pro', skills: ['Excel'], hourly_rate: '5', availability: 'part-time' };
  const badLink = async (extra) => (await call('/profile', { ...profile, ...extra }, 'PUT')).status;
  assert.equal(await badLink({ portfolio_url: 'javascript:alert(1)' }), 400);
  assert.equal(await badLink({ portfolio_url: 'not a link' }), 400);
  assert.equal(await badLink({ linkedin_url: 'https://evil.com/linkedin.com' }), 400);
  assert.equal(await badLink({ linkedin_url: 'https://notlinkedin.com/in/juan' }), 400);
  const prof = await call('/profile', { ...profile, portfolio_url: 'juan.dev/work', linkedin_url: 'www.linkedin.com/in/juan' }, 'PUT');
  assert.deepEqual([prof.body.portfolio_url, prof.body.linkedin_url], ['https://juan.dev/work', 'https://www.linkedin.com/in/juan']);
  assert.equal(prof.status, 200);
  assert.equal((await call('/workers?skill=excel', { token: emp.body.token }, 'GET')).body.workers[0].name, 'Juan');
  assert.equal((await call('/workers?skill=excel')).status, 401); // talent isn't public
  assert.equal((await call('/workers?skill=excel', { token: wrk.body.token }, 'GET')).status, 403); // workers can't browse other workers
  const juanId = (await call('/me', { token: wrk.body.token }, 'GET')).body.id;
  assert.equal((await call(`/workers/${juanId}`, { token: wrk.body.token }, 'GET')).status, 200); // own profile
  assert.equal((await call(`/workers/${juanId}`, { token: emp.body.token }, 'GET')).status, 200);
  assert.equal((await call(`/workers/${juanId}`)).status, 401);
  assert.deepEqual((await call('/stats')).body, { jobs: 1, workers: 1, employers: 1, upgraded_this_month: 0 });

  const other = await call('/auth/register', { email: 'other@co.com', password: 'password1', name: 'Other', role: 'employer' });
  assert.equal((await call(`/jobs/${job.body.id}/applications`, { token: other.body.token }, 'GET')).body.total, 0);
  assert.equal((await call(`/jobs/${job.body.id}`, { token: other.body.token }, 'DELETE')).status, 404);
  assert.equal((await call(`/jobs/${job.body.id}`, { token: emp.body.token }, 'DELETE')).status, 204);
});

test('credits: daily budget, bidding order, validation', async () => {
  const reg = async (email, role) => (await call('/auth/register', { email, password: 'password1', name: email.split('@')[0], role })).body.token;
  const boss = await reg('boss2@co.com', 'employer');
  const [low, high] = [await reg('low@x.ph', 'worker'), await reg('high@x.ph', 'worker')];
  const newJob = async () => (await call('/jobs', { token: boss, title: 'VA', description: 'x', job_type: 'gig' })).body.id;
  const [j1, j2, j3] = [await newJob(), await newJob(), await newJob()];
  const apply = (token, job, credits) => call(`/jobs/${job}/apply`, { token, cover_letter: 'hi', ...(credits !== undefined && { credits }) });

  assert.deepEqual((await call('/credits', { token: high }, 'GET')).body.remaining, 60);
  assert.equal((await apply(low, j1)).body.credits, 1); // default 1
  assert.equal((await apply(high, j1, 40)).status, 201);
  for (const c of [-1, 61, 2.5, 'ten']) assert.equal((await apply(high, j2, c)).status, 400);

  const left = await apply(high, j2, 21); // 40 + 21 > 60
  assert.equal(left.status, 400);
  assert.equal(left.body.error, 'You have 20 credits left today');
  assert.equal((await apply(high, j2, 20)).status, 201);
  assert.equal((await apply(high, j3, 1)).status, 400); // budget spent
  assert.equal((await apply(high, j3, 0)).body.credits, 0); // credits are optional: 0 still applies
  assert.equal((await apply(high, j1, 1)).status, 409); // duplicate: no credits charged

  const c = (await call('/credits', { token: high }, 'GET')).body;
  assert.deepEqual([c.used, c.remaining, c.applications], [60, 0, 3]);
  assert.ok(new Date(c.resets_at) > new Date());

  const applicants = (await call(`/jobs/${j1}/applications`, { token: boss }, 'GET')).body.applicants;
  const mine = (await call('/my/jobs', { token: boss }, 'GET')).body.find((j) => j.id === j1);
  assert.deepEqual([mine.applicant_count, mine.new_count, mine.analyzed_count, mine.top_applicants], [2, 2, 0, ['high', 'low']]);
  assert.deepEqual(applicants.map((a) => [a.name, a.credits]), [['high', 40], ['low', 1]]);
  assert.equal((await call('/credits', { token: boss }, 'GET')).status, 403);

  // Daily cap on applications, since 0-credit ones cost nothing.
  const spam = await reg('spam@x.ph', 'worker');
  for (let i = 0; i < 60; i++) {
    // jobs made directly: the API caps job posts per month
    const { rows: [j] } = await pool.query("INSERT INTO jobs (employer_id, title, description, job_type) SELECT id, 'VA', 'x', 'gig' FROM users WHERE email = 'boss2@co.com' RETURNING id");
    await pool.query("INSERT INTO applications (job_id, worker_id, cover_letter, credits) SELECT $1, id, 'x', 0 FROM users WHERE email = 'spam@x.ph'", [j.id]);
  }
  assert.equal((await apply(spam, j3, 0)).status, 429);
});

test('messages: who can write, read tracking, one email per unread batch', async () => {
  const emails = [];
  app.locals.sendEmail = async (e) => { if (!/^(Welcome|Your job is live)/.test(e.subject) && !isCode(e)) emails.push(e); };
  const reg = async (email, role, name) => (await call('/auth/register', { email, password: 'password1', name, role })).body;
  const boss = await reg('hr@acme.ph', 'employer', 'Acme HR');
  const rival = await reg('hr@rival.ph', 'employer', 'Rival');
  const maria = await reg('maria@x.ph', 'worker', 'Maria');
  const job = (await call('/jobs', { token: boss.token, title: 'Bookkeeper', description: 'x', job_type: 'gig' })).body;
  const rivalJob = (await call('/jobs', { token: rival.token, title: 'Other', description: 'x', job_type: 'gig' })).body;
  await pool.query("UPDATE users SET plan = 'pro' WHERE id = $1", [boss.user.id]); // paid: may reach out first
  const send = (from, to, body, job_id) => call(`/messages/${to.user.id}`, { token: from.token, body, ...(job_id && { job_id }) });
  const thread = (me, other) => call(`/messages/${other.user.id}`, { token: me.token }, 'GET');
  // Everyone here just used the site, which counts as "on the site right now" (no email). Set them away first.
  // (The "last active" update runs just after each request, so wait a moment for it before overriding it.)
  const away = async () => {
    await new Promise((r) => setTimeout(r, 30));
    await pool.query("UPDATE users SET last_seen_at = now() - interval '1 hour' WHERE email IN ('hr@acme.ph', 'maria@x.ph')");
  };

  assert.equal((await send(maria, boss, 'Hi, hire me')).status, 403); // workers can't cold-message
  assert.equal((await send(boss, rival, 'hey')).status, 404); // employer -> employer
  assert.equal((await send(boss, boss, 'me')).status, 404);
  assert.equal((await send(boss, maria, '   ')).status, 400);
  assert.equal((await send(boss, maria, 'x', rivalJob.id)).status, 400); // someone else's job

  await away();
  const first = await send(boss, maria, 'Loved your application!', job.id);
  assert.equal(first.status, 201);
  assert.equal(first.body.job_title, 'Bookkeeper');
  await send(boss, maria, 'Are you free for a call?');
  assert.equal(emails.length, 1); // second unread message: no extra email
  assert.equal(emails[0].to, 'maria@x.ph');
  assert.match(emails[0].text, /Acme HR sent you a message on ReadyToWork.ph about "Bookkeeper"/);
  assert.match(emails[0].text, new RegExp(`/messages\\?with=${boss.user.id}`));
  assert.ok(emails[0].html.includes('<a href=')); // branded HTML version is sent too
  assert.ok(!/<script|<img/i.test(emails[0].html));

  assert.equal((await call('/messages/unread-count', { token: maria.token }, 'GET')).body.count, 2);
  const inbox = (await call('/messages', { token: maria.token }, 'GET')).body;
  assert.deepEqual(inbox.map((c) => [c.name, c.unread, c.last_body]), [['Acme HR', 2, 'Are you free for a call?']]);

  const t = (await thread(maria, boss)).body; // opening marks read
  await away();
  assert.deepEqual([t.user.name, t.can_send, t.messages.length, t.messages[0].job_title], ['Acme HR', true, 2, 'Bookkeeper']);
  assert.equal((await call('/messages/unread-count', { token: maria.token }, 'GET')).body.count, 0);

  assert.equal((await send(maria, boss, 'Yes, tomorrow works', job.id)).status, 201); // reply now allowed
  assert.equal(emails.length, 2);
  assert.equal(emails[1].to, 'hr@acme.ph');
  await away();
  await send(boss, maria, 'Great, 10am'); // Maria read everything, so she gets a new email
  assert.equal(emails.length, 3);

  // On the site right now: Messages shows it within seconds, so no email.
  await thread(maria, boss);
  await new Promise((r) => setTimeout(r, 30));
  await pool.query("UPDATE users SET last_seen_at = now() WHERE email = 'maria@x.ph'");
  await send(boss, maria, 'See you then');
  assert.equal(emails.length, 3);
  // Message emails switched off on the Account page: none, even when away.
  await thread(maria, boss);
  assert.equal((await call('/me/notifications', { token: maria.token, message_emails: 'no' }, 'PUT')).status, 400);
  assert.equal((await call('/me/notifications', { token: maria.token, message_emails: false }, 'PUT')).body.message_emails, false);
  assert.equal((await call('/me', { token: maria.token }, 'GET')).body.message_emails, false);
  await away();
  await send(boss, maria, 'One more thing');
  assert.equal(emails.length, 3);
  await call('/me/notifications', { token: maria.token, message_emails: true }, 'PUT');
  assert.equal((await thread(boss, maria)).body.messages.length, 6);
  assert.equal((await thread(rival, maria)).body.messages.length, 0); // other employers see nothing
  assert.equal((await thread(maria, rival)).body.can_send, false);
});

test('removing people from Messages: one or many, only for me, back when a new message arrives', async () => {
  const reg = async (email, role) => (await call('/auth/register', { email, password: 'password1', name: email.split('@')[0], role })).body;
  const boss = await reg('hide.boss@co.com', 'employer');
  await pool.query("UPDATE users SET plan = 'pro' WHERE id = $1", [boss.user.id]);
  const [a, b, c] = await Promise.all(['a', 'b', 'c'].map((x) => reg(`hide.${x}@x.ph`, 'worker')));
  for (const w of [a, b, c]) await call(`/messages/${w.user.id}`, { token: boss.token, body: 'Hi' });
  await call(`/messages/${boss.user.id}`, { token: a.token, body: 'Hello!' }); // unread for the boss
  const inbox = async (t) => (await call('/messages', { token: t }, 'GET')).body.map((r) => r.user_id);

  assert.equal((await call('/messages/hide', { token: boss.token, user_ids: [] })).status, 400);
  assert.equal((await call('/messages/hide', { token: boss.token, user_ids: [a.user.id] })).status, 204); // one
  assert.deepEqual(await inbox(boss.token), [c.user.id, b.user.id]);
  assert.equal((await call('/messages/unread-count', { token: boss.token }, 'GET')).body.count, 0); // its unread cleared
  assert.equal((await call('/messages/hide', { token: boss.token, user_ids: [b.user.id, c.user.id] })).status, 204); // many
  assert.deepEqual(await inbox(boss.token), []);
  assert.deepEqual(await inbox(a.token), [boss.user.id]); // the other side keeps the chat
  assert.equal((await call(`/messages/${a.user.id}`, { token: boss.token }, 'GET')).body.messages.length, 2); // nothing deleted

  await call(`/messages/${boss.user.id}`, { token: a.token, body: 'Still there?' });
  assert.deepEqual(await inbox(boss.token), [a.user.id]); // a new message brings them back
});

test('messages show the employer which of their jobs the worker applied to', async () => {
  const reg = async (email, role) => (await call('/auth/register', { email, password: 'password1', name: email.split('@')[0], role })).body;
  const boss = await reg('ap.boss@co.com', 'employer');
  const rival = await reg('ap.rival@co.com', 'employer');
  const w = await reg('ap.w@x.ph', 'worker');
  const post = async (who, title) => (await call('/jobs', { token: who.token, title, description: 'x', job_type: 'gig' })).body;
  const [a1, a2, other] = [await post(boss, 'Bookkeeper'), await post(boss, 'Data entry'), await post(rival, 'Rival job')];
  for (const j of [a1, a2, other]) await call(`/jobs/${j.id}/apply`, { token: w.token, cover_letter: 'hi' });
  await call(`/messages/${w.user.id}`, { token: boss.token, body: 'Hello', job_id: a1.id });

  const thread = (await call(`/messages/${w.user.id}`, { token: boss.token }, 'GET')).body;
  assert.deepEqual(thread.applied.map((x) => x.title), ['Data entry', 'Bookkeeper']); // newest first, never the rival's job
  assert.deepEqual(thread.applied.map((x) => [x.messaged, x.hired, x.score]), [[false, false, null], [true, false, null]]); // messaged about Bookkeeper only
  assert.deepEqual((await call('/messages', { token: boss.token }, 'GET')).body[0].applied.map((x) => x.job_id), [a2.id, a1.id]);
  assert.equal((await call(`/messages/${boss.user.id}`, { token: w.token }, 'GET')).body.applied, undefined); // workers don't get it
});

test('welcome email once the email is confirmed, tailored by role', async () => {
  sent.length = 0;
  const codes = [];
  app.locals.sendEmail = async (e) => { if (isCode(e)) codes.push(e); else sent.push(e); };
  const signUp = async (email, name, role) => {
    const r = await call('/auth/register', { email, password: 'password1', name, role, unconfirmed: true });
    assert.ok(!sent.some((e) => e.to === email)); // the code first; no welcome yet
    await call('/auth/verify', { token: r.body.token, code: codes.at(-1).text.match(/Your code: (\d{6})/)[1] });
  };
  await signUp('new.worker@x.ph', 'Rosa', 'worker');
  await signUp('new.boss@co.com', 'Bright Co', 'employer');
  await call('/auth/register', { email: 'new.boss@co.com', password: 'password1', name: 'Dup', role: 'employer' }); // 409: no email
  await call('/auth/login', { email: 'new.worker@x.ph', password: 'password1' }); // login: no email
  assert.deepEqual(sent.map((e) => e.to), ['new.worker@x.ph', 'new.boss@co.com']);
  assert.match(sent[0].subject, /get you hired/);
  assert.match(sent[0].text, /Hi Rosa,[\s\S]*60 free Credits[\s\S]*\/profile/);
  assert.match(sent[1].subject, /start hiring/);
  assert.match(sent[1].text, /Hi Bright Co,[\s\S]*\/jobs\/new/);
});

test('employer gets a "job is live" email after posting', async () => {
  const boss = (await call('/auth/register', { email: 'live.boss@co.com', password: 'password1', name: 'Live Co', role: 'employer' })).body.token;
  sent.length = 0;
  app.locals.sendEmail = capture;
  const job = (await call('/jobs', { token: boss, title: 'Video <b>editor</b>', description: 'Edit videos', job_type: 'gig' })).body;
  await new Promise((r) => setTimeout(r, 50)); // sent in the background
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'live.boss@co.com');
  assert.equal(sent[0].subject, 'Your job is live: Video <b>editor</b>');
  assert.match(sent[0].text, new RegExp(`Hi Live Co,[\\s\\S]*/dashboard/jobs/${job.id}`));
  assert.ok(!sent[0].html.includes('<b>editor')); // title is escaped in HTML
});

test('code screen sends a code when the account has none left (old sign-ups, or after 10 minutes)', async () => {
  const t = (await call('/auth/register', { email: 'nocode.w@x.ph', password: 'password1', name: 'N', role: 'worker', unconfirmed: true })).body.token;
  const hash = async () => (await pool.query("SELECT code_hash FROM email_codes e JOIN users u ON u.id = e.user_id WHERE u.email = 'nocode.w@x.ph'")).rows[0]?.code_hash;
  const before = await hash();
  await pool.query("UPDATE email_codes SET expires_at = now() - interval '1 second', sent_at = now() - interval '11 minutes' WHERE code_hash = $1", [before]);
  assert.equal((await call('/auth/verify/resend', { token: t, if_none: true })).body.sent, true);
  assert.notEqual(await hash(), before);
  await pool.query("DELETE FROM email_codes WHERE code_hash = $1", [await hash()]); // no code at all, as before codes existed
  await pool.query("UPDATE email_codes SET sent_at = now() - interval '2 minutes'");
  assert.equal((await call('/auth/verify/resend', { token: t, if_none: true })).body.sent, true);
  assert.ok(await hash());
});

test('job page knows when the worker already applied', async () => {
  const boss = (await call('/auth/register', { email: 'dup.boss@co.com', password: 'password1', name: 'B', role: 'employer' })).body.token;
  const w = (await call('/auth/register', { email: 'dup.w@x.ph', password: 'password1', name: 'W', role: 'worker' })).body.token;
  const job = (await call('/jobs', { token: boss, title: 'VA', description: 'x', job_type: 'gig' })).body;
  const mine = async () => (await call(`/jobs/${job.id}/my-application`, { token: w }, 'GET')).body.application;
  assert.equal(await mine(), null);
  assert.equal((await call(`/jobs/${job.id}/apply`, { token: w, cover_letter: 'first', credits: 3 })).status, 201);
  assert.equal((await call(`/jobs/${job.id}/apply`, { token: w, cover_letter: 'again' })).status, 409);
  assert.deepEqual([(await mine()).cover_letter, (await mine()).credits], ['first', 3]);
  assert.equal((await call(`/jobs/${job.id}/my-application`, { token: boss }, 'GET')).status, 403);
});

test('analyzer: 5 free analyses, cached results free, premium unlimited, owner only', async () => {
  const calls = [];
  app.locals.analyzeApplication = async ({ job, applicant }) => {
    calls.push({ job, applicant });
    return { score: 150, verdict: 'Solid fit', strengths: ['A', 'B', 'C', 'D', 'E'], concerns: [] }; // out-of-range score gets clamped
  };
  const reg = async (email, role) => (await call('/auth/register', { email, password: 'password1', name: email.split('@')[0], role })).body.token;
  const boss = await reg('ai.boss@co.com', 'employer');
  const other = await reg('ai.other@co.com', 'employer');
  const job = (await call('/jobs', { token: boss, title: 'Data Entry', description: 'Excel work', skills: 'excel', job_type: 'gig' })).body;
  const appIds = [];
  for (let i = 0; i < 11; i++) {
    const w = await reg(`ai.w${i}@x.ph`, 'worker');
    appIds.push((await call(`/jobs/${job.id}/apply`, { token: w, cover_letter: `Letter ${i}` })).body.id);
  }
  const analyze = (token, id) => call(`/applications/${id}/analyze`, { token }, 'POST');

  assert.deepEqual((await call('/analyzer/usage', { token: boss }, 'GET')).body, { plan: 'free', used: 0, limit: 5, remaining: 5 });
  assert.equal((await analyze(other, appIds[0])).status, 404); // not their job
  const first = await analyze(boss, appIds[0]);
  assert.equal(first.status, 200);
  assert.equal(first.body.analysis.score, 100);
  assert.equal(first.body.analysis.strengths.length, 4);
  assert.equal(calls[0].job.title, 'Data Entry');
  assert.equal(calls[0].applicant.cover_letter, 'Letter 0');

  assert.equal((await analyze(boss, appIds[0])).body.usage.remaining, 4); // cached: no extra call, no extra use
  assert.equal(calls.length, 1);
  for (const id of appIds.slice(1, 5)) assert.equal((await analyze(boss, id)).status, 200);
  const blocked = await analyze(boss, appIds[5]);
  assert.equal(blocked.status, 402);
  assert.equal(blocked.body.upgrade, true);
  assert.equal(calls.length, 5); // the 6th never reached the AI
  assert.equal((await analyze(boss, appIds[3])).status, 200); // re-opening an analyzed one still works

  const list = (await call(`/jobs/${job.id}/applications`, { token: boss }, 'GET')).body.applicants;
  assert.equal(list.filter((a) => a.analysis).length, 5);

  const upgraded = async () => (await call('/stats', {}, 'GET')).body.upgraded_this_month;
  const upgradedBefore = await upgraded();
  await pool.query("UPDATE users SET plan = 'pro' WHERE email = 'ai.boss@co.com'");
  assert.equal((await call('/analyzer/usage', { token: boss }, 'GET')).body.limit, 500); // pro: bigger allowance
  assert.equal(await upgraded(), upgradedBefore + 1); // plan change is stamped by the trigger
  await pool.query("UPDATE users SET plan = 'premium' WHERE email = 'ai.boss@co.com'");
  const premium = await analyze(boss, appIds[10]);
  assert.equal(premium.status, 200);
  assert.equal(premium.body.usage.remaining, null);

  app.locals.analyzeApplication = async () => { throw new Error('API down'); };
  const w = await reg('ai.late@x.ph', 'worker');
  const late = (await call(`/jobs/${job.id}/apply`, { token: w, cover_letter: 'late' })).body.id;
  assert.equal((await analyze(boss, late)).status, 502);
});

test('resumes: PDF only, size limit, attach on apply, private to the hiring employer', async () => {
  const reg = async (email, role) => (await call('/auth/register', { email, password: 'password1', name: email.split('@')[0], role })).body.token;
  const worker = await reg('cv.worker@x.ph', 'worker');
  const boss = await reg('cv.boss@co.com', 'employer');
  const rival = await reg('cv.rival@co.com', 'employer');
  const upload = (token, body, name = 'Maria CV.pdf', type = 'application/pdf') =>
    fetch(`${base}/profile/resume`, { method: 'PUT', headers: { ...asCookie(token), 'content-type': type, 'x-file-name': encodeURIComponent(name) }, body })
      .then(async (r) => ({ status: r.status, body: await r.json() }));
  const pdf = (text) => Buffer.from(`%PDF-1.7\n${text}`);

  assert.equal((await call('/profile/resume', { token: worker }, 'GET')).body.resume, null);
  assert.equal((await upload(worker, Buffer.from('not a pdf'))).status, 400);
  assert.equal((await upload(worker, Buffer.from('%PDF-'), 'x.pdf', 'image/png')).status, 400); // wrong type: body not parsed
  assert.equal((await upload(worker, Buffer.concat([pdf(''), Buffer.alloc(5 * 1024 * 1024)]))).status, 413);
  assert.equal((await upload(boss, pdf('x'))).status, 403);

  const first = await upload(worker, pdf('v1'), '../../etc/Maria CV<script>.pdf');
  assert.equal(first.status, 200);
  assert.equal(first.body.resume.name, '.._.._etc_Maria CV_script_.pdf'); // unsafe characters replaced
  const firstKey = [...files.keys()].find((k) => k.startsWith('resumes/'));

  const job = (await call('/jobs', { token: boss, title: 'VA', description: 'x', job_type: 'gig' })).body;
  const job2 = (await call('/jobs', { token: boss, title: 'VA 2', description: 'x', job_type: 'gig' })).body;
  const withCv = (await call(`/jobs/${job.id}/apply`, { token: worker, cover_letter: 'hi' })).body; // attached by default
  const noCv = (await call(`/jobs/${job2.id}/apply`, { token: worker, cover_letter: 'hi', attach_resume: false })).body;
  assert.equal(withCv.resume_attached, true);
  assert.equal(noCv.resume_attached, false);

  const view = (token, id) => call(`/applications/${id}/resume`, { token }, 'GET');
  const listed = async () => (await call(`/jobs/${job.id}/applications`, { token: boss }, 'GET')).body.applicants[0].resume_name;
  assert.match((await view(boss, withCv.id)).body.url, new RegExp(firstKey));
  assert.equal(await listed(), '.._.._etc_Maria CV_script_.pdf');
  assert.equal((await view(boss, noCv.id)).status, 404);
  assert.equal((await view(rival, withCv.id)).status, 404); // other employers can't see it
  assert.equal((await view(worker, withCv.id)).status, 403);

  await upload(worker, pdf('v2'), 'New CV.pdf'); // replace: old file deleted, application shows the new one
  const resumeKeys = () => [...files.keys()].filter((k) => k.startsWith('resumes/'));
  assert.equal(resumeKeys().length, 1);
  assert.ok(!files.has(firstKey));
  assert.match((await view(boss, withCv.id)).body.url, new RegExp(resumeKeys()[0]));
  assert.equal(await listed(), 'New CV.pdf');
  assert.equal((await call('/profile/resume', { token: worker }, 'GET')).body.resume.name, 'New CV.pdf');

  assert.equal((await call('/profile/resume', { token: worker }, 'DELETE')).status, 204); // remove: file gone, detached everywhere
  assert.equal(resumeKeys().length, 0);
  assert.equal((await view(boss, withCv.id)).status, 404);
  assert.equal(await listed(), null);
  assert.equal((await call('/profile/resume', { token: worker }, 'GET')).body.resume, null);
  const late = (await call(`/jobs/${(await call('/jobs', { token: boss, title: 'VA 3', description: 'x', job_type: 'gig' })).body.id}/apply`, { token: worker, cover_letter: 'hi' })).body;
  assert.equal(late.resume_attached, false); // nothing to attach without a resume
});

// Smallest valid one-page PDF with real text (pdf.js tolerates the missing xref table).
const textPdf = (text) => Buffer.from(`%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj
4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
5 0 obj<</Length ${text.length + 30}>>stream
BT /F1 12 Tf 72 700 Td (${text}) Tj ET
endstream endobj
trailer<</Root 1 0 R>>
%%EOF`);

test('job pay: cents and pay period, validated', async () => {
  const boss = (await call('/auth/register', { email: 'pay.boss@co.com', password: 'password1', name: 'B', role: 'employer' })).body.token;
  const post = (extra) => call('/jobs', { token: boss, title: 'VA', description: 'x', job_type: 'part-time', ...extra });
  const hourly = (await post({ salary_min: '7.505', salary_max: 12, salary_period: 'hour' })).body;
  assert.deepEqual([Number(hourly.salary_min), Number(hourly.salary_max), hourly.salary_period], [7.51, 12, 'hour']); // rounded to cents
  assert.equal((await post({})).body.salary_period, 'month'); // default
  assert.equal((await post({ salary_period: 'week' })).status, 400);
  assert.equal((await post({ salary_min: -1 })).status, 400);
  assert.equal((await post({ salary_min: 20, salary_max: 10 })).status, 400);
});

test('jobs: owner edits and closes; closed jobs leave search and refuse applications', async () => {
  const reg = async (email, role) => (await call('/auth/register', { email, password: 'password1', name: email.split('@')[0], role })).body.token;
  const boss = await reg('ed.boss@co.com', 'employer');
  const rival = await reg('ed.rival@co.com', 'employer');
  const w = await reg('ed.w@x.ph', 'worker');
  const job = (await call('/jobs', { token: boss, title: 'Zebra keeper', description: 'x', job_type: 'gig', salary_min: 10, salary_max: 12 })).body;
  const edit = { title: 'Zebra keeper (remote)', description: 'y', job_type: 'part-time', salary_min: 10, salary_max: 12, salary_period: 'hour' };

  assert.equal((await call(`/jobs/${job.id}`, { token: rival, ...edit }, 'PUT')).status, 404); // not theirs
  assert.equal((await call(`/jobs/${job.id}`, { token: boss, ...edit, salary_period: 'week' }, 'PUT')).status, 400);
  const edited = (await call(`/jobs/${job.id}`, { token: boss, ...edit }, 'PUT')).body;
  assert.deepEqual([edited.title, edited.salary_period, !!edited.updated_at], ['Zebra keeper (remote)', 'hour', true]);

  const search = async () => (await call('/jobs?q=zebra', {}, 'GET')).body.length;
  assert.equal(await search(), 1);
  assert.equal((await call(`/jobs/${job.id}/closed`, { token: rival, closed: true }, 'PUT')).status, 404);
  assert.ok((await call(`/jobs/${job.id}/closed`, { token: boss, closed: true }, 'PUT')).body.closed_at);
  assert.equal(await search(), 0); // hidden from search
  assert.ok((await call(`/jobs/${job.id}`, {}, 'GET')).body.closed_at); // still viewable by link
  assert.equal((await call(`/jobs/${job.id}/apply`, { token: w, cover_letter: 'hi' })).status, 409);
  assert.equal((await call(`/jobs/${job.id}/closed`, { token: boss, closed: false }, 'PUT')).body.closed_at, null); // reopen
  assert.equal((await call(`/jobs/${job.id}/apply`, { token: w, cover_letter: 'hi' })).status, 201);
});

test("an employer's own application limit closes the job, can be raised to reopen, and is validated", async () => {
  const reg = async (email, role) => (await call('/auth/register', { email, password: 'password1', name: email.split('@')[0], role })).body.token;
  const boss = await reg('lim.boss@co.com', 'employer');
  const base = { title: 'Limited', description: 'x', job_type: 'gig' };
  assert.equal((await call('/jobs', { token: boss, ...base, max_applications: 0 })).status, 400);
  assert.equal((await call('/jobs', { token: boss, ...base, max_applications: 2.5 })).status, 400);
  assert.equal((await call('/jobs', { token: boss, ...base })).body.max_applications, null); // optional
  const job = (await call('/jobs', { token: boss, ...base, max_applications: 2 })).body;
  assert.equal(job.max_applications, 2);
  const [w1, w2, w3] = await Promise.all([1, 2, 3].map((i) => reg(`lim.w${i}@x.ph`, 'worker')));
  for (const w of [w1, w2]) assert.equal((await call(`/jobs/${job.id}/apply`, { token: w, cover_letter: 'hi' })).status, 201);
  assert.ok((await call(`/jobs/${job.id}`, {}, 'GET')).body.closed_at); // the 2nd closed it
  assert.equal((await call(`/jobs/${job.id}/apply`, { token: w3, cover_letter: 'hi' })).status, 409);
  assert.match((await call(`/jobs/${job.id}/closed`, { token: boss, closed: false }, 'PUT')).body.error, /your limit of 2/);
  assert.equal((await call(`/jobs/${job.id}`, { token: boss, ...base, max_applications: 5 }, 'PUT')).status, 200); // raise it…
  assert.equal((await call(`/jobs/${job.id}/closed`, { token: boss, closed: false }, 'PUT')).body.closed_at, null); // …then reopen
  assert.equal((await call(`/jobs/${job.id}/apply`, { token: w3, cover_letter: 'hi' })).status, 201);
  assert.ok((await call(`/jobs/${job.id}`, { token: boss, ...base, max_applications: 3 }, 'PUT')).body.closed_at); // lowering to what it has closes it
  assert.equal((await call('/settings', {}, 'GET')).body.max_job_applications, 250);
});

test('each plan caps applications per job: Free 20, Pro 100, Premium 250', async () => {
  const reg = async (email, role) => (await call('/auth/register', { email, password: 'password1', name: email.split('@')[0], role })).body.token;
  const boss = await reg('plancap.boss@co.com', 'employer');
  const base = { title: 'Capped', description: 'x', job_type: 'gig' };
  const over = await call('/jobs', { token: boss, ...base, max_applications: 21 });
  assert.equal(over.status, 402);
  assert.equal(over.body.upgrade, true);
  assert.match(over.body.error, /Free plan accepts up to 20 .* Pro to accept up to 100, or Premium for up to 250/);
  const job = (await call('/jobs', { token: boss, ...base, max_applications: 20 })).body;
  assert.equal(job.max_applications, 20);
  assert.equal((await call(`/jobs/${job.id}`, { token: boss, ...base, max_applications: 50 }, 'PUT')).status, 402); // edits too
  await pool.query("UPDATE users SET plan = 'pro' WHERE email = 'plancap.boss@co.com'");
  assert.equal((await call(`/jobs/${job.id}`, { token: boss, ...base, max_applications: 100 }, 'PUT')).status, 200);
  assert.match((await call(`/jobs/${job.id}`, { token: boss, ...base, max_applications: 101 }, 'PUT')).body.error, /Pro plan accepts up to 100 applications per job\. Upgrade to Premium/);
  await pool.query("UPDATE users SET plan = 'premium' WHERE email = 'plancap.boss@co.com'");
  assert.equal((await call(`/jobs/${job.id}`, { token: boss, ...base, max_applications: 250 }, 'PUT')).status, 200);
  assert.equal((await call(`/jobs/${job.id}`, { token: boss, ...base, max_applications: 251 }, 'PUT')).status, 402);

  // No limit set: the plan's cap still closes the job.
  await pool.query("UPDATE users SET plan = 'free' WHERE email = 'plancap.boss@co.com'");
  const open = (await call('/jobs', { token: boss, ...base })).body;
  const workers = await Promise.all(Array.from({ length: 21 }, (_, i) => reg(`plancap.w${i}@x.ph`, 'worker')));
  for (const w of workers.slice(0, 20)) assert.equal((await call(`/jobs/${open.id}/apply`, { token: w, cover_letter: 'hi' })).status, 201);
  assert.ok((await call(`/jobs/${open.id}`, {}, 'GET')).body.closed_at); // the 20th closed it
  assert.equal((await call(`/jobs/${open.id}/apply`, { token: workers[20], cover_letter: 'hi' })).status, 409);
  const reopen = await call(`/jobs/${open.id}/closed`, { token: boss, closed: false }, 'PUT');
  assert.equal(reopen.status, 402);
  assert.match(reopen.body.error, /20 applicants\. The Free plan accepts up to 20/);
});

test('a job closes itself when it reaches the most applications a job can take', async () => {
  const reg = async (email, role) => (await call('/auth/register', { email, password: 'password1', name: email.split('@')[0], role })).body.token;
  await pool.query(`INSERT INTO settings (key, value) VALUES ('max_job_applications', '10')`);
  try {
    const boss = await reg('cap.boss@co.com', 'employer');
    const job = (await call('/jobs', { token: boss, title: 'Cap test', description: 'x', job_type: 'gig' })).body;
    const workers = await Promise.all(Array.from({ length: 11 }, (_, i) => reg(`cap.w${i}@x.ph`, 'worker')));
    // Ten at once: the job lock keeps it at exactly ten.
    const sent = await Promise.all(workers.slice(0, 10).map((token) => call(`/jobs/${job.id}/apply`, { token, cover_letter: 'hi' })));
    assert.deepEqual(sent.map((r) => r.status), Array(10).fill(201));
    assert.ok((await call(`/jobs/${job.id}`, {}, 'GET')).body.closed_at); // the tenth closed it
    const late = await call(`/jobs/${job.id}/apply`, { token: workers[10], cover_letter: 'hi' });
    assert.equal(late.status, 409);
    assert.equal((await call('/credits', { token: workers[10] }, 'GET')).body.used, 0); // refused applies cost nothing
    const reopen = await call(`/jobs/${job.id}/closed`, { token: boss, closed: false }, 'PUT');
    assert.equal(reopen.status, 409); // a full job stays closed
    assert.match(reopen.body.error, /most a job can take/);
  } finally {
    await pool.query(`DELETE FROM settings WHERE key = 'max_job_applications'`);
  }
});

test('analyzer reads resume text extracted at upload, and says when it could not', async () => {
  const seen = [];
  app.locals.analyzeApplication = async ({ applicant }) => { seen.push(applicant.resume_text); return { score: 80, verdict: 'ok', strengths: [], concerns: [] }; };
  const reg = async (email, role) => (await call('/auth/register', { email, password: 'password1', name: email.split('@')[0], role })).body.token;
  const boss = await reg('rt.boss@co.com', 'employer');
  const job = (await call('/jobs', { token: boss, title: 'Bookkeeper', description: 'QuickBooks', job_type: 'gig' })).body;
  const put = (token, body) => fetch(`${base}/profile/resume`, { method: 'PUT', headers: { ...asCookie(token), 'content-type': 'application/pdf' }, body });
  const applyAndAnalyze = async (email, pdf, attach = true) => {
    const w = await reg(email, 'worker');
    if (pdf) assert.equal((await put(w, pdf)).status, 200);
    const a = (await call(`/jobs/${job.id}/apply`, { token: w, cover_letter: 'hi', attach_resume: attach })).body;
    return (await call(`/applications/${a.id}/analyze`, { token: boss }, 'POST')).body.analysis.resume;
  };

  assert.equal(await applyAndAnalyze('rt.text@x.ph', textPdf('5 years QuickBooks bookkeeping')), 'read');
  assert.match(seen[0], /5 years QuickBooks bookkeeping/);
  assert.equal(await applyAndAnalyze('rt.scan@x.ph', Buffer.from('%PDF-1.4 scanned image only')), 'unreadable');
  assert.equal(seen[1], '');
  assert.equal(await applyAndAnalyze('rt.none@x.ph', textPdf('hidden'), false), 'none'); // not attached: never sent
  assert.equal(seen[2], null);
  const { rows } = await pool.query("SELECT resume_text FROM worker_profiles p JOIN users u ON u.id = p.user_id WHERE u.email = 'rt.text@x.ph'");
  assert.match(rows[0].resume_text, /QuickBooks/);
});

test('profile photos: images only, size limit, replace deletes old, public link falls back to blank', async () => {
  const token = (await call('/auth/register', { email: 'ph.user@x.ph', password: 'password1', name: 'Pic', role: 'worker' })).body;
  const put = (body, type = 'image/jpeg') =>
    fetch(`${base}/profile/photo`, { method: 'PUT', headers: { ...asCookie(token.token), 'content-type': type }, body });
  const view = () => fetch(`${base}/users/${token.user.id}/photo`, { redirect: 'manual' });
  const jpeg = (tag) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`jpeg body ${tag}`)]);
  const photoKeys = () => [...files.keys()].filter((k) => k.startsWith('photos/'));

  assert.equal((await view()).headers.get('content-type'), 'image/gif'); // no photo yet
  assert.equal((await put(Buffer.from('%PDF-1.4 not an image'))).status, 400); // claims JPEG, isn't
  assert.equal((await put(jpeg('x'), 'image/gif')).status, 400); // type not accepted
  assert.equal((await put(Buffer.concat([jpeg('big'), Buffer.alloc(1024 * 1024)]))).status, 413);
  assert.equal((await put(jpeg('v1'))).status, 200);
  const first = photoKeys()[0];
  assert.match(first, /\.jpeg$/);
  const res = await view();
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), new RegExp(first));

  assert.equal((await put(jpeg('v2'))).status, 200); // replace: old file deleted
  assert.equal(photoKeys().length, 1);
  assert.ok(!files.has(first));
  assert.equal((await fetch(`${base}/profile/photo`, { method: 'DELETE', headers: { ...asCookie(token.token) } })).status, 204);
  assert.equal(photoKeys().length, 0);
  assert.equal((await view()).headers.get('content-type'), 'image/gif');
});

test('admin: separate login, lockout, settings validated and applied', async () => {
  process.env.ADMIN_EMAIL = 'admin@test.ph';
  process.env.ADMIN_PASSWORD = 'correct horse battery';
  assert.equal((await call('/settings', {}, 'GET')).body.topups_enabled, false); // off by default
  assert.equal((await call('/admin/settings', {}, 'GET')).status, 401);
  const worker = (await call('/auth/register', { email: 'adm.w@x.ph', password: 'password1', name: 'W', role: 'worker' })).body.token;
  assert.equal((await call('/admin/settings', { token: worker }, 'GET')).status, 401); // user tokens aren't admin

  assert.equal((await call('/admin/login', { email: 'admin@test.ph', password: 'nope' })).status, 401);
  const { token } = (await call('/admin/login', { email: 'ADMIN@test.ph', password: 'correct horse battery' })).body;
  assert.equal((await call('/me', { token }, 'GET')).status, 401); // admin tokens aren't user accounts
  assert.deepEqual((await call('/admin/settings', { token }, 'GET')).body, { topups_enabled: false, daily_applications: 60, free_ai_analyses: 5, free_full_names: false, max_job_applications: 250, notice: null, homepage_design: 'classic', homepage_photo: 'laughing', sample_jobs_per_day: 0 });

  assert.equal((await call('/admin/settings', { token, topups_enabled: 'yes' }, 'PUT')).status, 400);
  assert.equal((await call('/admin/settings', { token, made_up: 1 }, 'PUT')).status, 400);
  assert.equal((await call('/admin/settings', { token, homepage_design: 'fancy' }, 'PUT')).status, 400);
  assert.equal((await call('/admin/settings', { token, homepage_photo: 'cat' }, 'PUT')).status, 400);
  assert.equal((await call('/admin/settings', { token, homepage_design: 'two_faces' }, 'PUT')).status, 200);
  await call('/admin/settings', { token, homepage_design: 'hello_call', homepage_photo: 'good_news' }, 'PUT');
  const pub = (await call('/settings', {}, 'GET')).body;
  assert.deepEqual([pub.homepage_design, pub.homepage_photo], ['hello_call', 'good_news']); // the homepage reads these
  const saved = await call('/admin/settings', { token, topups_enabled: true, free_ai_analyses: 3 }, 'PUT');
  assert.deepEqual(saved.body, { topups_enabled: true, daily_applications: 60, free_ai_analyses: 3, free_full_names: false, max_job_applications: 250, notice: null, homepage_design: 'hello_call', homepage_photo: 'good_news', sample_jobs_per_day: 0 });
  assert.equal((await call('/settings', {}, 'GET')).body.topups_enabled, true);
  const boss = (await call('/auth/register', { email: 'adm.b@co.com', password: 'password1', name: 'B', role: 'employer' })).body.token;
  assert.equal((await call('/analyzer/usage', { token: boss }, 'GET')).body.limit, 3); // setting is used live

  // The notice bar: plain text and a colour, optional end time; only a live one reaches the site.
  for (const bad of [{ text: 'x', tone: 'info' }, { text: 'Maintenance', tone: 'red' }, { text: 'Maintenance', tone: 'info', html: '<b>' }, { text: 'Maintenance', tone: 'info', ends_at: 'soon' }])
    assert.equal((await call('/admin/settings', { token, notice: bad }, 'PUT')).status, 400, JSON.stringify(bad));
  assert.equal((await call('/admin/settings', { token, notice: { text: ' Maintenance tonight 10pm ', tone: 'warning' } }, 'PUT')).status, 200);
  assert.deepEqual((await call('/settings', {}, 'GET')).body.notice, { text: 'Maintenance tonight 10pm', tone: 'warning' });
  await call('/admin/settings', { token, notice: { text: 'Over', tone: 'info', ends_at: new Date(Date.now() - 1000).toISOString() } }, 'PUT');
  assert.equal((await call('/settings', {}, 'GET')).body.notice, null); // past its end time
  await pool.query('DELETE FROM settings');

  for (let i = 0; i < 5; i++) await call('/admin/login', { email: 'admin@test.ph', password: 'wrong' });
  assert.equal((await call('/admin/login', { email: 'admin@test.ph', password: 'correct horse battery' })).status, 429); // locked out
});

test('auth rate limits: wrong passwords and sign-ups per visitor', async () => {
  app.locals.relaxedLimits = false;
  try {
    await call('/auth/register', { email: 'rl@x.ph', password: 'password1', name: 'RL', role: 'worker' });
    // different emails, so this measures the per-visitor limit (one account locks after 5: tested below)
    for (let i = 0; i < 10; i++) assert.equal((await call('/auth/login', { email: `rl.nobody${i}@x.ph`, password: 'wrong' })).status, 401);
    assert.equal((await call('/auth/login', { email: 'rl@x.ph', password: 'password1' })).status, 429); // locked even with the right password
  } finally {
    app.locals.relaxedLimits = true;
  }
});

test('google sign-in: signup needs a role, links existing email, rejects bad tokens', async () => {
  process.env.GOOGLE_CLIENT_ID = 'test-client';
  const accounts = {
    'good-new': { sub: 'g-1', email: 'Ana@gmail.com', email_verified: true, name: 'Ana Cruz' },
    'good-existing': { sub: 'g-2', email: 'juan@x.ph', email_verified: true, name: 'Juan' },
    unverified: { sub: 'g-3', email: 'x@gmail.com', email_verified: false },
  };
  app.locals.verifyGoogle = async (t) => { if (!accounts[t]) throw new Error('bad'); return accounts[t]; };
  const google = (credential, role) => call('/auth/google', { credential, ...(role && { role }) });

  assert.equal((await google('forged')).status, 401);
  assert.equal((await google('unverified', 'worker')).status, 401);
  const noRole = await google('good-new');
  assert.equal(noRole.status, 404);
  assert.equal(noRole.body.needsRole, true);

  sent.length = 0;
  app.locals.sendEmail = capture;
  const ana = await google('good-new', 'worker');
  assert.deepEqual(sent.map((e) => e.to), ['ana@gmail.com']); // Google sign-up gets a welcome email too
  assert.equal(ana.status, 201);
  assert.deepEqual([ana.body.user.email, ana.body.user.name, ana.body.user.role], ['ana@gmail.com', 'Ana Cruz', 'worker']);
  assert.equal((await google('good-new')).body.user.id, ana.body.user.id); // returning user, no role needed
  const asEmployer = await google('good-new', 'employer'); // same Google account, other role: no silent login
  assert.equal(asEmployer.status, 409);
  assert.equal(asEmployer.body.existingRole, 'worker');
  assert.equal(asEmployer.body.token, undefined);
  assert.equal((await google('good-new', 'worker')).body.user.id, ana.body.user.id); // same role just logs in
  assert.equal((await call('/auth/login', { email: 'ana@gmail.com', password: 'anything1' })).body.code, 'google_account');

  // An account made with this email and a password (anyone could have, emails aren't verified): Google links
  // to it, removes the password, signs out the other logins, and tells the owner.
  await pool.query("UPDATE users SET email_verified_at = NULL WHERE email = 'juan@x.ph'"); // never confirmed
  const before = await call('/auth/login', { email: 'juan@x.ph', password: 'password1' });
  assert.equal(before.status, 200);
  assert.equal((await call('/me', { token: before.body.token }, 'GET')).status, 200);
  await new Promise((r) => setTimeout(r, 1100)); // logins are stamped to the second
  const juan = await google('good-existing');
  assert.equal(juan.status, 200);
  assert.equal(juan.body.user.role, 'worker');
  assert.deepEqual(sent.slice(1).map((e) => e.subject), ['Your ReadyToWork.ph account now signs in with Google']); // no welcome email
  assert.equal((await call('/auth/login', { email: 'juan@x.ph', password: 'password1' })).body.code, 'google_account'); // the old password is gone
  assert.equal((await call('/me', { token: before.body.token }, 'GET')).status, 401); // the earlier login was signed out
  assert.equal((await call('/me', { token: juan.body.token }, 'GET')).status, 200);
});

test('security: only Cloudflare may call the API, per-visitor and per-user limits, bad JSON is a 400', async () => {
  const raw = (path, headers = {}, init = {}) => fetch(base + path, { headers, ...init });
  process.env.ORIGIN_SECRET = 'test-origin-secret';
  try {
    assert.equal((await raw('/stats')).status, 403); // straight to Cloud Run
    assert.equal((await raw('/stats', { 'x-origin-secret': 'guess' })).status, 403);
    assert.equal((await raw('/stats', { 'x-origin-secret': 'test-origin-secret' })).status, 200);
  } finally {
    delete process.env.ORIGIN_SECRET;
  }

  const broken = await raw('/auth/login', { 'content-type': 'application/json' }, { method: 'POST', body: '{nope' });
  assert.equal(broken.status, 400);

  app.locals.relaxedLimits = false;
  try {
    // Each visitor (Cloudflare's address header) gets its own 300-a-minute budget.
    process.env.ORIGIN_SECRET = 's';
    const as = (ip) => raw('/settings', { 'x-origin-secret': 's', 'x-visitor-ip': ip });
    for (let i = 0; i < 300; i++) await as('9.9.9.9');
    assert.equal((await as('9.9.9.9')).status, 429);
    assert.equal((await as('8.8.8.8')).status, 200);
  } finally {
    delete process.env.ORIGIN_SECRET;
    app.locals.relaxedLimits = true;
  }
});

test('admin dashboard stats: counts, activity and country (no IPs)', async () => {
  const { signAdminToken } = await import('../src/middleware/auth.js');
  const admin = signAdminToken();
  const w = (await call('/auth/register', { email: 'stats.w@x.ph', password: 'password1', name: 'Stat W', role: 'worker' })).body.token;
  assert.equal((await call('/admin/stats', { token: w }, 'GET')).status, 401); // users can't see it

  // A signed-in request records last activity and Cloudflare's country code.
  await fetch(`${base}/me`, { headers: { ...asCookie(w), 'cf-ipcountry': 'PH' } });
  await new Promise((r) => setTimeout(r, 100)); // the write happens after the response
  const { status, body } = await call('/admin/stats', { token: admin }, 'GET');
  assert.equal(status, 200);
  assert.ok(body.totals.users >= 1 && body.totals.workers >= 1 && body.totals.active_now >= 1);
  assert.equal(body.signups.length, 30);
  assert.ok(body.countries.some((c) => c.country === 'PH'));
  assert.ok(body.recent.length && body.recent.every((u) => !('email' in u))); // no emails in the dashboard data
});

test('login says what went wrong; forgot password sends a one-time, expiring link', async () => {
  const signup = await call('/auth/register', { email: 'forgot@x.ph', password: 'password1', name: 'Forgetful', role: 'worker' });
  const wrong = await call('/auth/login', { email: 'forgot@x.ph', password: 'nope-nope' });
  assert.deepEqual([wrong.status, wrong.body.code, typeof wrong.body.attemptsLeft], [401, 'wrong_password', 'number']);
  assert.equal((await call('/auth/login', { email: 'nobody@x.ph', password: 'whatever1' })).body.code, 'no_account');

  sent.length = 0;
  app.locals.sendEmail = capture;
  assert.equal((await call('/auth/forgot', { email: 'nobody@x.ph' })).status, 200); // same answer, no email
  assert.equal(sent.length, 0);
  assert.equal((await call('/auth/forgot', { email: 'Forgot@X.ph' })).status, 200);
  assert.equal(sent.length, 1);
  // (call() treats a `token` field as the login token, so reset requests are sent directly)
  const reset = async (token, password) => {
    const res = await fetch(`${base}/auth/reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password }) });
    return { status: res.status, body: await res.json() };
  };
  const token = sent[0].text.match(/reset-password\?token=([\w-]+)/)[1];
  const { rows } = await pool.query('SELECT token_hash FROM password_resets');
  assert.ok(rows.every((r) => r.token_hash !== token)); // only a hash is stored

  assert.equal((await reset(token, 'short')).status, 400);
  await new Promise((r) => setTimeout(r, 1100)); // logins are stamped to the second
  const done = await reset(token, 'brand-new-pass');
  assert.equal((await call('/me', { token: signup.body.token }, 'GET')).status, 401); // a reset signs out every other device
  assert.equal(done.status, 200);
  assert.equal(done.body.user.email, 'forgot@x.ph');
  assert.equal((await reset(token, 'another-pass')).body.code, 'invalid_link'); // one use only
  assert.equal((await call('/auth/login', { email: 'forgot@x.ph', password: 'brand-new-pass' })).status, 200);
  assert.equal((await call('/auth/login', { email: 'forgot@x.ph', password: 'password1' })).status, 401);

  await pool.query(`UPDATE password_resets SET expires_at = now() - interval '1 minute'`);
  await call('/auth/forgot', { email: 'forgot@x.ph' });
  const late = sent.at(-1).text.match(/reset-password\?token=([\w-]+)/)[1];
  await pool.query(`UPDATE password_resets SET expires_at = now() - interval '1 minute'`);
  assert.equal((await reset(late, 'too-late-pass')).body.code, 'invalid_link'); // expired
});

test('forgot password: at most 3 reset emails per account per hour, same answer after that', async () => {
  await call('/auth/register', { email: 'flood@x.ph', password: 'password1', name: 'Flood', role: 'worker' });
  sent.length = 0;
  app.locals.sendEmail = capture;
  const ask = async () => (await call('/auth/forgot', { email: 'flood@x.ph' })).status;
  for (let i = 0; i < 6; i++) assert.equal(await ask(), 200); // never tells a bot it was stopped
  assert.equal(sent.filter((e) => e.to === 'flood@x.ph').length, 3);
  await pool.query(`UPDATE password_resets SET expires_at = now() - interval '1 minute'`); // an hour later
  assert.equal(await ask(), 200);
  assert.equal(sent.filter((e) => e.to === 'flood@x.ph').length, 4);
});

test('names carry no links, emails, phones or @handles; passwords are 8 to 200 characters', async () => {
  const reg = (name, password = 'password1', email = `nm${Math.random().toString(36).slice(2, 8)}@x.ph`) =>
    call('/auth/register', { email, password, name, role: 'employer' });
  for (const name of ['Pay here scam-site.com', 'Rosa www.example.org', 'Rosa rosa@mail.com', 'Call 0917 123 4567', 'Rosa @rosa_ph'])
    assert.match((await reg(name)).body.error, /no links, emails, phone numbers or @handles/, name);
  assert.equal((await reg("Rosa Dela Cruz-O'Neil")).status, 201); // ordinary names are fine
  assert.equal((await reg('Bright Co 2024')).status, 201); // short numbers too
  assert.match((await reg('Rosa', 'x'.repeat(201))).body.error, /200 characters or fewer/);
  assert.equal((await reg('Rosa', 'x'.repeat(200))).status, 201);

  const me = (await reg('Plain Name')).body.token;
  assert.equal((await call('/me', { token: me, name: 'Visit scam.xyz' }, 'PUT')).status, 400); // renaming too
  assert.equal((await call('/me', { token: me, name: 'New Name' }, 'PUT')).status, 200);

  // Google names are whatever was typed there: the contact bits are dropped rather than refusing the sign-up.
  process.env.GOOGLE_CLIENT_ID = 'test-client';
  app.locals.verifyGoogle = async () => ({ sub: 'g-name-1', email: 'gname@x.ph', email_verified: true, name: 'Ana scam.com Cruz', given_name: 'Ana', family_name: 'Cruz @ana' });
  const g = await call('/auth/google', { credential: 'x', role: 'worker' });
  assert.equal(g.body.user.name, 'Ana Cruz');
  const { rows: [row] } = await pool.query("SELECT first_name, last_name FROM users WHERE email = 'gname@x.ph'");
  assert.deepEqual([row.first_name, row.last_name], ['Ana', 'Cruz']);
});

test('Not a fit: the job owner marks an applicant with why, or clears it; nobody else can', async () => {
  const reg = async (email, role) => (await call('/auth/register', { email, password: 'password1', name: email.split('@')[0], role })).body.token;
  const [boss, rival, w] = [await reg('nf.boss@co.com', 'employer'), await reg('nf.rival@co.com', 'employer'), await reg('nf.w@x.ph', 'worker')];
  const job = (await call('/jobs', { token: boss, title: 'VA', description: 'x', job_type: 'gig' })).body;
  const app_ = (await call(`/jobs/${job.id}/apply`, { token: w, cover_letter: 'hi' })).body;
  const mark = (token, reason) => call(`/applications/${app_.id}/not-fit`, { token, reason }, 'PUT');
  const listed = async () => (await call(`/jobs/${job.id}/applications`, { token: boss }, 'GET')).body.applicants[0].not_fit;
  assert.equal(await listed(), null);
  assert.equal((await mark(boss, 'bogus')).status, 400);
  assert.equal((await mark(rival, 'suspicious')).status, 404); // not their job
  assert.equal((await mark(w, 'suspicious')).status, 403); // workers can't
  assert.equal((await mark(boss, 'suspicious')).body.not_fit, 'suspicious');
  assert.equal(await listed(), 'suspicious');
  assert.equal((await mark(boss, null)).body.not_fit, null); // cleared
  assert.equal(await listed(), null);
});

test('emails in job posts are hidden from visitors, shown to signed-in members', async () => {
  const boss = (await call('/auth/register', { email: 'mask.boss@co.com', password: 'password1', name: 'Mask Co', role: 'employer' })).body.token;
  const job = (await call('/jobs', { token: boss, title: 'VA (apply: hr@maskco.com.ph)', description: 'Send your CV to Jobs.Team+va@mask-co.com or HR@maskco.com.ph today. Not an email: 5 @ 10am.', job_type: 'gig' })).body;
  const visitor = (await call(`/jobs/${job.id}`)).body;
  assert.ok(!/@mask/i.test(visitor.title + visitor.description));
  assert.equal(visitor.description, 'Send your CV to [contact hidden, log in to see it] or [contact hidden, log in to see it] today. Not an email: 5 @ 10am.');
  assert.ok(!(await call('/jobs')).body.some((j) => /@mask/i.test(j.description + j.title))); // the list too
  const member = (await call(`/jobs/${job.id}`, { token: boss }, 'GET')).body;
  assert.match(member.description, /Jobs\.Team\+va@mask-co\.com/);
});

test('logins are HttpOnly SameSite=Strict cookies; tokens never reach page scripts', async () => {
  const res = await fetch(`${base}/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'cookie@x.ph', password: 'password1', name: 'Cookie', role: 'worker' }),
  });
  const body = await res.json();
  assert.equal(body.token, undefined); // nothing for JavaScript to steal
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith('rw_session='));
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.match(cookie, /Path=\/api/);
  const token = cookie.match(/^rw_session=([^;]+)/)[1];

  assert.equal((await call('/me', { token }, 'GET')).status, 200);
  const bearer = await fetch(`${base}/me`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(bearer.status, 401); // the old header style doesn't work any more

  const out = await fetch(`${base}/auth/logout`, { method: 'POST', headers: asCookie(token) });
  assert.equal(out.status, 204);
  assert.match(out.headers.getSetCookie().join(), /rw_session=;/); // cookie cleared
});

test('sitemap lists open jobs only', async () => {
  const boss = (await call('/auth/register', { email: 'sm.boss@co.com', password: 'password1', name: 'SM', role: 'employer' })).body.token;
  const open = (await call('/jobs', { token: boss, title: 'Open one', description: 'x', job_type: 'gig' })).body;
  const shut = (await call('/jobs', { token: boss, title: 'Closed one', description: 'x', job_type: 'gig' })).body;
  await call(`/jobs/${shut.id}/closed`, { token: boss, closed: true }, 'PUT');
  const ids = (await call('/jobs/sitemap')).body.map((j) => j.id);
  assert.ok(ids.includes(open.id) && !ids.includes(shut.id));
});

test('Paddle webhook switches plans, and only when signed', async () => {
  const { createHmac } = await import('node:crypto');
  Object.assign(process.env, { PADDLE_WEBHOOK_SECRET: 'whsec', PADDLE_PRICE_PRO_MONTHLY: 'pri_pro', PADDLE_PRICE_PREMIUM_YEARLY: 'pri_prem' });
  const boss = await call('/auth/register', { email: 'paying@co.com', password: 'password1', name: 'Payer', role: 'employer' });
  const id = boss.body.user.id;
  const send = async (sub, { secret = 'whsec', ts = Math.floor(Date.now() / 1000) } = {}) => {
    const body = JSON.stringify({ event_type: 'subscription.updated', data: { customer_id: 'ctm_1', custom_data: { user_id: String(id) }, ...sub } });
    const h1 = createHmac('sha256', secret).update(`${ts}:${body}`).digest('hex');
    return (await fetch(`${base}/billing/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'paddle-signature': `ts=${ts};h1=${h1}` }, body })).status;
  };
  const plan = async () => (await pool.query('SELECT plan FROM users WHERE id = $1', [id])).rows[0].plan;
  const sub = (status, price, updated_at, subId = 'sub_1') => ({ id: subId, status, updated_at, items: [{ price: { id: price } }] });

  assert.equal(await send(sub('active', 'pri_pro', '2026-01-01T00:00:00Z'), { secret: 'wrong' }), 401);
  assert.equal(await send(sub('active', 'pri_pro', '2026-01-01T00:00:00Z'), { ts: 1 }), 401); // too old to trust
  assert.equal(await plan(), 'free');

  assert.equal(await send(sub('active', 'pri_pro', '2026-01-01T00:00:00Z')), 204);
  assert.equal(await plan(), 'pro');
  assert.equal(await send(sub('active', 'pri_prem', '2026-01-03T00:00:00Z')), 204);
  assert.equal(await plan(), 'premium');
  await send(sub('active', 'pri_pro', '2026-01-02T00:00:00Z')); // late, older event is ignored
  assert.equal(await plan(), 'premium');
  await send(sub('canceled', 'pri_prem', '2026-01-04T00:00:00Z', 'sub_other')); // not their subscription
  assert.equal(await plan(), 'premium');
  assert.equal(await send(sub('active', 'pri_unknown', '2026-01-05T00:00:00Z')), 500); // misconfigured: Paddle retries
  const stranger = { ...sub('active', 'pri_unknown', '2026-01-05T00:00:00Z', 'sub_sample'), custom_data: null };
  assert.equal(await send(stranger), 204); // not one of our accounts (e.g. a Paddle simulation): ignored
  await send(sub('canceled', 'pri_prem', '2026-01-06T00:00:00Z'));
  assert.equal(await plan(), 'free');
});

test('plan limits: job posts per month, visible applicants, outreach, monthly AI analyses', async () => {
  const reg = async (email, role) => (await call('/auth/register', { email, password: 'password1', name: email.split('@')[0], role })).body;
  const boss = await reg('limits@co.com', 'employer');
  const setPlan = (plan) => pool.query('UPDATE users SET plan = $1 WHERE id = $2', [plan, boss.user.id]);
  const post = () => call('/jobs', { token: boss.token, title: 'VA', description: 'x', job_type: 'gig' });

  // Free: 3 job posts a month; last month's posts don't count.
  const jobs = [(await post()).body.id, (await post()).body.id, (await post()).body.id];
  const fourth = await post();
  assert.equal(fourth.status, 402);
  assert.match(fourth.body.error, /3 jobs this month.*Upgrade to Pro/);
  assert.equal((await call('/my/job-quota', { token: boss.token }, 'GET')).body.remaining, 0);
  await pool.query("UPDATE jobs SET created_at = now() - interval '40 days' WHERE id = $1", [jobs[0]]);
  assert.equal((await post()).status, 201);

  // Everyone can apply; Free sees the first 20 to apply (most Credits listed first), the rest wait behind an upgrade.
  const { rows: workers } = await pool.query(
    "INSERT INTO users (email, name, role) SELECT 'lw' || i || '@x.ph', 'Worker ' || i, 'worker' FROM generate_series(1, 25) i RETURNING id");
  for (const [i, w] of workers.entries())
    await pool.query("INSERT INTO applications (job_id, worker_id, cover_letter, credits) VALUES ($1, $2, 'hi', $3)", [jobs[1], w.id, i === 24 ? 50 : i === 2 ? 10 : 1]);
  const list = (await call(`/jobs/${jobs[1]}/applications`, { token: boss.token }, 'GET')).body;
  assert.deepEqual([list.applicants.length, list.total, list.limit, list.plan], [20, 25, 20, 'free']);
  assert.equal(list.applicants[0].name, 'Worker 3'); // a higher bid lists first among the visible
  assert.ok(!list.applicants.some((a) => a.name === 'Worker 25')); // a big bid doesn't jump the line: the 25th stays hidden
  const { rows: [hidden] } = await pool.query('SELECT id FROM applications WHERE job_id = $1 AND worker_id = $2', [jobs[1], workers[23].id]);
  app.locals.analyzeApplication = async () => ({ score: 70, verdict: 'ok', strengths: [], concerns: [] });
  assert.equal((await call(`/applications/${hidden.id}/analyze`, { token: boss.token }, 'POST')).status, 402);
  await pool.query("INSERT INTO worker_profiles (user_id, resume_key, resume_name) VALUES ($1, 'k', 'cv.pdf')", [workers[23].id]);
  await pool.query('UPDATE applications SET resume_attached = true WHERE id = $1', [hidden.id]);
  assert.equal((await call(`/applications/${hidden.id}/resume`, { token: boss.token }, 'GET')).status, 402);
  await setPlan('premium');
  assert.equal((await call(`/jobs/${jobs[1]}/applications`, { token: boss.token }, 'GET')).body.applicants.length, 25);
  await setPlan('free');

  // Free employers can message applicants, not cold-message other workers; paid plans can.
  const stranger = await reg('stranger@x.ph', 'worker');
  const msg = (to) => call(`/messages/${to}`, { token: boss.token, body: 'Hi!' });
  assert.equal((await msg(workers[0].id)).status, 201);
  const cold = await msg(stranger.user.id);
  assert.equal(cold.status, 403);
  assert.equal(cold.body.upgrade, true);
  await setPlan('pro');
  assert.equal((await msg(stranger.user.id)).status, 201);

  // AI analyses count per calendar month: last month's don't use this month's allowance.
  await setPlan('free');
  const { rows: [first] } = await pool.query('SELECT id FROM applications WHERE job_id = $1 ORDER BY created_at, id LIMIT 1', [jobs[1]]);
  assert.equal((await call(`/applications/${first.id}/analyze`, { token: boss.token }, 'POST')).body.usage.used, 1);
  await pool.query("UPDATE ai_analyses SET created_at = now() - interval '40 days' WHERE application_id = $1", [first.id]);
  assert.equal((await call('/analyzer/usage', { token: boss.token }, 'GET')).body.used, 0);
});

test('hiring analytics: Premium only, filters by period and job, funnel, fit mix, best candidates', async () => {
  const reg = async (email, role) => (await call('/auth/register', { email, password: 'password1', name: email.split('@')[0], role })).body;
  const boss = await reg('stats.boss@co.com', 'employer');
  const [a, b, c] = [await reg('stats.a@x.ph', 'worker'), await reg('stats.b@x.ph', 'worker'), await reg('stats.c@x.ph', 'worker')];
  const post = async (title) => (await pool.query("INSERT INTO jobs (employer_id, title, description, job_type) VALUES ($1, $2, 'x', 'gig') RETURNING id", [boss.user.id, title])).rows[0].id;
  const [editor, va] = [await post('Editor'), await post('VA')];
  const apply = (job, w, credits, score, ago = 0) => pool.query(
    `INSERT INTO applications (job_id, worker_id, cover_letter, credits, analysis, created_at) VALUES ($1, $2, 'hi', $3, $4, now() - $5 * interval '1 day')`,
    [job, w.user.id, credits, score == null ? null : { score }, ago]);
  await apply(editor, a, 5, 90); await apply(editor, b, 1, 50); await apply(va, c, 20, 70);
  await apply(va, a, 0, null, 45); // older than 30 days
  await call(`/messages/${a.user.id}`, { token: boss.token, body: 'Hi!' }); // boss is Free but a applied: allowed
  await call(`/messages/${boss.user.id}`, { token: a.token, body: 'Hello!' });

  const get = (q = '') => call(`/analytics${q}`, { token: boss.token }, 'GET');
  assert.equal((await get()).status, 402);
  await pool.query("UPDATE users SET plan = 'premium' WHERE id = $1", [boss.user.id]);

  const all = (await get()).body;
  assert.deepEqual([all.days, all.unit, all.chart.length], [30, 'day', 30]);
  assert.deepEqual(all.funnel, { applied: 3, scored: 3, messaged: 1, replied: 1 });
  assert.deepEqual(all.mix, { strong: 1, good: 1, partial: 1, poor: 0 });
  assert.equal(all.tiles.avg_score, 70);
  assert.equal(all.chart.at(-1).applicants, 3); // today
  assert.deepEqual(all.candidates.map((x) => x.name), ['stats.c', 'stats.b']); // a was messaged; best fit first
  assert.deepEqual(all.jobs.map((j) => [j.title, j.applicants, j.trend.length]), [['VA', 1, 12], ['Editor', 2, 12]]);

  assert.equal((await get('?days=90')).body.funnel.applied, 4); // the older application counts
  assert.equal((await get('?days=90')).body.unit, 'week');
  const one = (await get(`?job=${editor}`)).body;
  assert.deepEqual([one.funnel.applied, one.candidates.length, one.jobs.length], [2, 1, 2]); // the job list stays whole for the picker
  assert.equal((await get('?job=999999')).status, 404);
});

test('job title and description: too long is a clear error, not a silent cut', async () => {
  const boss = (await call('/auth/register', { email: 'long.post@co.com', password: 'password1', name: 'Long', role: 'employer' })).body.token;
  const post = (fields) => call('/jobs', { token: boss, title: 'VA', description: 'x', job_type: 'gig', ...fields });
  assert.match((await post({ title: 'a'.repeat(121) })).body.error, /title is too long/);
  assert.match((await post({ description: 'a'.repeat(10_001) })).body.error, /too long \(max 10,000/);
  const ok = await post({ title: 'a'.repeat(120), description: 'a'.repeat(10_000), skills: ['s'.repeat(80)] });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.description.length, 10_000);
  assert.equal(ok.body.skills[0].length, 50);
});

test('Premium AI analyses: unlimited up to the monthly fair-use ceiling', async () => {
  const { PREMIUM_FAIR_USE } = await import('../src/config.js');
  const boss = (await call('/auth/register', { email: 'fair.use@co.com', password: 'password1', name: 'Fair', role: 'employer' })).body;
  await pool.query("UPDATE users SET plan = 'premium' WHERE id = $1", [boss.user.id]);
  const { rows: [job] } = await pool.query("INSERT INTO jobs (employer_id, title, description, job_type) VALUES ($1, 'VA', 'x', 'gig') RETURNING id", [boss.user.id]);
  // PREMIUM_FAIR_USE analyses already made this month, plus one fresh applicant
  await pool.query(
    `WITH w AS (INSERT INTO users (email, name, role) VALUES ('fu@x.ph', 'W', 'worker') RETURNING id)
     INSERT INTO applications (job_id, worker_id, cover_letter) SELECT $1, id, 'hi' FROM w`, [job.id]);
  await pool.query('INSERT INTO ai_analyses (employer_id) SELECT $1 FROM generate_series(1, $2::int)', [boss.user.id, PREMIUM_FAIR_USE]);
  const usage = (await call('/analyzer/usage', { token: boss.token }, 'GET')).body;
  assert.deepEqual([usage.limit, usage.remaining, usage.used], [null, 0, PREMIUM_FAIR_USE]);
  const { rows: [fresh] } = await pool.query('SELECT id FROM applications WHERE job_id = $1 AND analysis IS NULL', [job.id]);
  const blocked = await call(`/applications/${fresh.id}/analyze`, { token: boss.token }, 'POST');
  assert.equal(blocked.status, 402);
  assert.match(blocked.body.error, /fair-use limit of 10,000/);
});

test('re-analyze: a fresh AI look on demand, and each run uses one from the allowance', async () => {
  const reg = async (email, role) => (await call('/auth/register', { email, password: 'password1', name: email.split('@')[0], role })).body.token;
  const boss = await reg('again.boss@co.com', 'employer');
  const worker = await reg('again.w@x.ph', 'worker');
  const job = (await call('/jobs', { token: boss, title: 'VA', description: 'x', job_type: 'gig' })).body;
  const appId = (await call(`/jobs/${job.id}/apply`, { token: worker, cover_letter: 'hi' })).body.id;
  let score = 60;
  app.locals.analyzeApplication = async () => ({ score: score++, verdict: 'ok', strengths: [], concerns: [] });
  const analyze = (body) => call(`/applications/${appId}/analyze`, { token: boss, ...body }, 'POST');

  const first = (await analyze()).body;
  assert.deepEqual([first.analysis.score, first.usage.used], [60, 1]);
  assert.deepEqual([(await analyze()).body.analysis.score, (await analyze()).body.usage.used], [60, 1]); // saved result: free
  const again = (await analyze({ again: true })).body;
  assert.deepEqual([again.analysis.score, again.usage.used], [61, 2]); // fresh look, counted
});

test('feedback: anyone can send it, support gets an email, the admin reads it and marks it done', async () => {
  app.locals.sendEmail = capture;
  const user = await call('/auth/register', { email: 'fb.user@co.com', password: 'password1', name: 'Fiona', role: 'employer' });
  await new Promise((r) => setImmediate(r));
  sent.length = 0; // drop the welcome email
  const send = (body, token) => call('/feedback', { ...(token && { token }), ...body });

  assert.equal((await send({ type: 'nope', message: 'x' })).status, 400);
  assert.equal((await send({ type: 'idea', message: '   ' })).status, 400);
  assert.equal((await send({ type: 'idea', message: 'a'.repeat(2001) })).status, 400);
  assert.equal((await send({ type: 'idea', message: 'hi', email: 'not an email' })).status, 400);
  assert.equal((await send({ type: 'bug', message: 'Score all froze', page: '/dashboard/jobs/3', contact_ok: true }, user.body.token)).status, 201);
  assert.equal((await send({ type: 'idea', message: 'Dark mode please', email: 'guest@mail.ph' })).status, 201);
  await new Promise((r) => setImmediate(r));
  assert.equal(sent.length, 2);
  assert.equal(sent[0].to, 'support@readytowork.ph');
  assert.match(sent[0].text, /Something broke from Fiona <fb.user@co.com> \(employer, free\)/);

  const { signAdminToken } = await import('../src/middleware/auth.js');
  const adminToken = signAdminToken();
  const list = (await call('/admin/feedback', { token: adminToken }, 'GET')).body;
  assert.deepEqual(list.map((f) => [f.type, f.email]), [['idea', 'guest@mail.ph'], ['bug', 'fb.user@co.com']]);
  assert.equal((await call(`/admin/feedback/${list[1].id}`, { token: adminToken, done: true }, 'PUT')).status, 204);
  assert.ok((await call('/admin/feedback', { token: adminToken }, 'GET')).body.at(-1).done_at);
  assert.equal((await call('/admin/feedback', { token: user.body.token }, 'GET')).status, 401);
});

test('admin: users, jobs and subscriptions pages; close a job; admin only', async () => {
  const { signAdminToken } = await import('../src/middleware/auth.js');
  const admin = signAdminToken();
  const reg = async (email, role, name) => (await call('/auth/register', { email, password: 'password1', name, role })).body;
  const boss = await reg('adm.boss@acme.ph', 'employer', 'Adm Boss');
  await reg('adm.worker@x.ph', 'worker', 'Adm Worker');
  const job = (await call('/jobs', { token: boss.token, title: 'Spammy 100% legit job', description: 'x', job_type: 'gig' })).body;

  const users = (await call('/admin/users?q=adm.boss%40acme&role=employer', { token: admin }, 'GET')).body;
  assert.deepEqual([users.total, users.users[0].email, users.users[0].jobs], [1, 'adm.boss@acme.ph', 1]);
  assert.equal((await call('/admin/users?q=100%', { token: admin }, 'GET')).body.total, 0); // % is searched literally
  assert.equal((await call('/admin/users', { token: boss.token }, 'GET')).status, 401);
  const all = (await call('/admin/users', { token: admin }, 'GET')).body;
  const p2 = (await call('/admin/users?per_page=10&page=1', { token: admin }, 'GET')).body; // rows per page, second page
  assert.deepEqual([p2.page_size, p2.users.length], [10, Math.max(0, Math.min(10, all.total - 10))]);
  assert.equal((await call('/admin/users?per_page=9999', { token: admin }, 'GET')).body.page_size, 25); // only 10/25/50/100

  const jobs = (await call('/admin/jobs?q=100%25', { token: admin }, 'GET')).body;
  assert.deepEqual([jobs.total, jobs.jobs[0].title, jobs.jobs[0].employer_name], [1, 'Spammy 100% legit job', 'Adm Boss']);
  assert.equal((await call(`/admin/jobs/${job.id}/closed`, { token: admin, closed: true }, 'PUT')).status, 204);
  assert.equal((await call('/admin/jobs?q=Spammy&status=open', { token: admin }, 'GET')).body.total, 0);
  assert.equal((await call(`/jobs/${job.id}/apply`, { token: (await reg('adm.w2@x.ph', 'worker', 'W2')).token, cover_letter: 'hi' })).status, 409);

  const key = process.env.PADDLE_API_KEY;
  delete process.env.PADDLE_API_KEY; // never call Paddle from tests
  await pool.query("UPDATE users SET plan = 'premium' WHERE id = $1", [boss.user.id]);
  const subs = (await call('/admin/subscriptions', { token: admin }, 'GET')).body;
  process.env.PADDLE_API_KEY = key ?? '';
  const mine = subs.subscriptions.find((x) => x.email === 'adm.boss@acme.ph');
  assert.deepEqual([mine.plan, mine.source], ['premium', 'manual']);
  assert.ok(subs.totals.premium >= 1 && subs.totals.manual >= 1);
});

test('worker privacy: free employers see "Maria S." and no links until they may contact the worker', async () => {
  const reg = async (email, role, name) => (await call('/auth/register', { email, password: 'password1', name, role })).body;
  const boss = await reg('priv.boss@co.com', 'employer', 'Priv Boss');
  const maria = await reg('priv.maria@x.ph', 'worker', 'Maria Clara Santos');
  const bio = 'QuickBooks pro using Node.js. Portfolio: mariasantos.com/work, email maria@gmail.com, call +63 917 123 4567 or @maria_books';
  await call('/profile', { token: maria.token, title: 'Bookkeeper', bio, skills: ['quickbooks'], availability: 'full-time', linkedin_url: 'linkedin.com/in/mariasantos' }, 'PUT');
  const view = async () => (await call(`/workers/${maria.user.id}`, { token: boss.token }, 'GET')).body;

  let w = await view();
  assert.deepEqual([w.name, w.linkedin_url, w.limited], ['Maria S.', null, true]);
  const { HIDDEN } = await import('../src/lib/contacts.js');
  assert.equal(w.bio, `QuickBooks pro using Node.js. Portfolio: ${HIDDEN}, email ${HIDDEN}, call ${HIDDEN} or ${HIDDEN}`); // Node.js stays
  const { hideContacts } = await import('../src/lib/contacts.js');
  assert.equal(hideContacts('email me at @juan.cruz@gmail.com'), `email me at @${HIDDEN}`); // one email, not a handle plus a site
  assert.equal((await call('/workers?q=QuickBooks', { token: boss.token }, 'GET')).body.workers.find((x) => x.id === maria.user.id).name, 'Maria S.');
  assert.equal((await call(`/workers/${maria.user.id}`, { token: maria.token }, 'GET')).body.name, 'Maria Clara Santos'); // her own profile

  // The admin can show Free employers full names; links and contact details stay hidden.
  await pool.query(`INSERT INTO settings (key, value) VALUES ('free_full_names', 'true')`);
  w = await view();
  assert.deepEqual([w.name, w.name_hidden, w.linkedin_url, w.limited], ['Maria Clara Santos', false, null, true]);
  await pool.query(`DELETE FROM settings WHERE key = 'free_full_names'`);

  // Age and gender: employers see the age, never the birth date.
  assert.equal((await call('/profile', { token: maria.token, availability: 'full-time', birth_date: '2015-01-01' }, 'PUT')).status, 400); // under 18
  assert.equal((await call('/profile', { token: maria.token, availability: 'full-time', gender: 'robot' }, 'PUT')).status, 400);
  const born = `${new Date().getFullYear() - 30}-01-01`;
  await call('/profile', { token: maria.token, title: 'Bookkeeper', bio, skills: ['quickbooks'], availability: 'full-time', linkedin_url: 'linkedin.com/in/mariasantos', birth_date: born, gender: 'female' }, 'PUT');
  w = await view();
  assert.deepEqual([w.age, w.gender, w.birth_date], [30, 'female', undefined]);
  assert.equal((await call(`/workers/${maria.user.id}`, { token: maria.token }, 'GET')).body.birth_date, born); // she can edit it

  const job = (await call('/jobs', { token: boss.token, title: 'Bookkeeper', description: 'x', job_type: 'gig' })).body;
  await call(`/jobs/${job.id}/apply`, { token: maria.token, cover_letter: 'Hi' });
  w = await view();
  assert.deepEqual([w.name, w.linkedin_url, w.limited, w.bio], ['Maria Clara Santos', 'https://linkedin.com/in/mariasantos', undefined, bio]); // she applied

  const other = await reg('priv.pro@co.com', 'employer', 'Pro Co');
  await pool.query("UPDATE users SET plan = 'pro' WHERE id = $1", [other.user.id]);
  assert.equal((await call(`/workers/${maria.user.id}`, { token: other.token }, 'GET')).body.name, 'Maria Clara Santos'); // paid plan
});

test('contact form and robot check: support requests reach the inbox; bots are turned away', async () => {
  app.locals.sendEmail = capture;
  sent.length = 0;
  const msg = { name: 'Ana', email: 'ana@shop.ph', subject: 'Refund question', message: 'How do refunds work?' };
  assert.equal((await call('/contact', { ...msg, email: 'nope' })).status, 400);
  assert.equal((await call('/contact', { ...msg, message: 'hi' })).status, 400);
  assert.equal((await call('/contact', msg)).status, 201); // no TURNSTILE_SECRET in tests: check skipped
  await new Promise((r) => setImmediate(r));
  assert.deepEqual([sent[0].to, sent[0].replyTo, sent[0].subject], ['support@readytowork.ph', 'ana@shop.ph', `Support #${(await pool.query("SELECT id FROM feedback WHERE subject = 'Refund question'")).rows[0].id}: Refund question`]);

  process.env.TURNSTILE_SECRET = 'test-secret'; // now a token is required
  try {
    const robot = await call('/contact', msg);
    assert.deepEqual([robot.status, robot.body.code], [400, 'robot_check']);
    assert.equal((await call('/auth/register', { email: 'bot@x.ph', password: 'password1', name: 'Bot', role: 'worker' })).body.code, 'robot_check');
    assert.equal((await call('/auth/forgot', { email: 'bot@x.ph' })).body.code, 'robot_check');
    assert.equal((await call('/admin/login', { email: 'a@b.ph', password: 'x' })).body.code, 'robot_check');
  } finally {
    delete process.env.TURNSTILE_SECRET;
  }
});

test('Hire Talent: filters, sort, pages; save workers; mark as hired', async () => {
  const reg = async (email, role, name) => (await call('/auth/register', { email, password: 'password1', name, role })).body;
  const boss = await reg('r1.boss@co.com', 'employer', 'R1 Boss');
  const mk = async (n, profile, seenDaysAgo) => {
    const w = await reg(`r1.w${n}@x.ph`, 'worker', `Worker${n} Cruz`);
    await call('/profile', { token: w.token, bio: 'x', ...profile }, 'PUT');
    // "last active" is saved in the background after the reply; wait for it so it can't overwrite ours below
    while (!(await pool.query('SELECT last_seen_at FROM users WHERE id = $1', [w.user.id])).rows[0].last_seen_at) await new Promise((r) => setTimeout(r, 5));
    await pool.query("UPDATE users SET last_seen_at = now() - $2 * interval '1 day' WHERE id = $1", [w.user.id, seenDaysAgo]);
    return w;
  };
  const a = await mk(1, { title: 'Zebra Bookkeeper', skills: ['zebrabooks', 'excel'], availability: 'full-time', hourly_rate: '8' }, 0);
  const b = await mk(2, { title: 'Zebra VA', skills: ['zebrabooks'], availability: 'part-time', hourly_rate: '4' }, 3);
  const c = await mk(3, { title: 'Writer', bio: 'I love zebra stories', skills: ['writing'], availability: 'gig', hourly_rate: '12' }, 60);
  const find = async (qs) => (await call(`/workers?${qs}`, { token: boss.token }, 'GET')).body;
  const ids = (r) => r.workers.map((w) => w.id);

  assert.deepEqual(ids(await find('q=zebra')), [a.user.id, b.user.id, c.user.id]); // title matches first, then most recently active
  assert.deepEqual(ids(await find('skills=zebrabooks,excel')), [a.user.id]);
  assert.deepEqual(ids(await find('q=zebra&availability=part-time')), [b.user.id]);
  assert.deepEqual(ids(await find('q=zebra&rate_min=5&rate_max=10')), [a.user.id]);
  assert.deepEqual(ids(await find('q=zebra&active=7')), [a.user.id, b.user.id]);
  assert.deepEqual(ids(await find('q=zebra&sort=rate')), [b.user.id, a.user.id, c.user.id]);
  assert.equal((await find('q=Cruz')).total, 0); // names aren't searchable
  const page2 = await find('q=zebra&page=1');
  assert.deepEqual([page2.total, page2.workers.length], [3, 0]);

  assert.equal((await call(`/saved/${b.user.id}`, { token: boss.token }, 'PUT')).status, 204);
  assert.equal((await find('q=zebra')).workers.find((w) => w.id === b.user.id).saved, true);
  assert.deepEqual((await call('/saved', { token: boss.token }, 'GET')).body.map((w) => [w.id, w.name]), [[b.user.id, 'Worker2 C.']]);
  assert.equal((await call(`/workers/${b.user.id}`, { token: boss.token }, 'GET')).body.saved, true);
  assert.equal((await call(`/saved/${b.user.id}`, { token: boss.token }, 'DELETE')).status, 204);
  assert.equal((await call('/saved', { token: boss.token }, 'GET')).body.length, 0);
  assert.equal((await call(`/saved/${boss.user.id}`, { token: boss.token }, 'PUT')).status, 404); // only workers

  assert.equal((await call(`/hires/${a.user.id}`, { token: boss.token }, 'PUT')).status, 403); // no relationship yet
  const job = (await call('/jobs', { token: boss.token, title: 'Books', description: 'x', job_type: 'gig' })).body;
  await call(`/jobs/${job.id}/apply`, { token: a.token, cover_letter: 'hi' });
  const myApp = async () => (await call('/my/applications', { token: a.token }, 'GET')).body[0];
  assert.deepEqual([(await myApp()).hired, (await myApp()).messaged], [false, false]); // the worker's dashboard status
  await call(`/messages/${a.user.id}`, { token: boss.token, body: 'Hi!', job_id: job.id }); // an applicant can always be messaged
  assert.equal((await myApp()).messaged, true);
  assert.equal((await call(`/hires/${a.user.id}`, { token: boss.token, job_id: job.id }, 'PUT')).status, 204);
  const hires = (await call('/my/hires', { token: boss.token }, 'GET')).body;
  assert.deepEqual(hires.map((h) => [h.name, h.job_title]), [['Worker1 Cruz', 'Books']]);
  assert.ok((await call(`/workers/${a.user.id}`, { token: boss.token }, 'GET')).body.hired_at);
  assert.equal((await myApp()).hired, true);
});

test('login protection: 5 wrong passwords pause the account for 15 minutes, email the owner; reset lifts it', async () => {
  app.locals.relaxedLimits = true; // the per-visitor limit is tested elsewhere; this is the per-account one
  app.locals.sendEmail = capture;
  await call('/auth/register', { email: 'lock.me@x.ph', password: 'password1', name: 'Lock Me', role: 'worker' });
  sent.length = 0;
  const login = (password) => call('/auth/login', { email: 'lock.me@x.ph', password });
  for (let i = 1; i <= 4; i++) {
    const r = await login('wrong-pass');
    assert.deepEqual([r.status, r.body.code], [401, 'wrong_password']);
    assert.equal(r.body.attemptsLeft, 5 - i); // tries left on this account
    if (i >= 2) assert.equal(r.body.robotCheck, true); // from the 2nd miss, the next try needs the robot check
  }
  const locked = await login('wrong-pass');
  assert.deepEqual([locked.status, locked.body.code], [429, 'locked']);
  assert.equal((await login('password1')).status, 429); // even the right password waits
  await new Promise((r) => setImmediate(r));
  assert.match(sent.at(-1).subject, /Someone tried to log in/);

  process.env.TURNSTILE_SECRET = 'test-secret';
  await pool.query("UPDATE users SET login_locked_until = NULL, failed_logins = 2, failed_login_at = now() WHERE email = 'lock.me@x.ph'");
  try {
    assert.equal((await login('password1')).body.code, 'robot_check'); // 2 recent misses: robot check needed
  } finally { delete process.env.TURNSTILE_SECRET; }

  await pool.query("UPDATE users SET login_locked_until = now() + interval '15 minutes' WHERE email = 'lock.me@x.ph'");
  await call('/auth/forgot', { email: 'lock.me@x.ph' });
  await new Promise((r) => setImmediate(r)); // the email goes out in the background
  const token = sent.at(-1).text.match(/token=([\w-]+)/)?.[1];
  assert.ok(token, 'reset link sent');
  // (the call() helper treats a "token" field as the login cookie, so send this one directly)
  const reset = await fetch(`${base}/auth/reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password: 'password2' }) });
  assert.equal(reset.status, 200);
  assert.equal((await login('password2')).status, 200); // a new password ends the pause
});

test('bento profile: optional fields saved and validated, hidden contacts, CV only for employers who may contact', async () => {
  const { HIDDEN } = await import('../src/lib/contacts.js');
  const reg = async (email, role, name) => (await call('/auth/register', { email, password: 'password1', name, role })).body;
  const w = await reg('bento.w@x.ph', 'worker', 'Bento Santos');
  const free = await reg('bento.free@co.com', 'employer', 'Free Co');
  const pro = await reg('bento.pro@co.com', 'employer', 'Pro Co');
  await pool.query("UPDATE users SET plan = 'pro' WHERE id = $1", [pro.user.id]);
  const base = { title: 'Bookkeeper', bio: 'Books', skills: 'QuickBooks, Excel', availability: 'full-time', hourly_rate: '8' };
  const save = (extra) => call('/profile', { token: w.token, ...base, ...extra }, 'PUT');

  const ok = await save({ skill_years: { QuickBooks: 5, Excel: 2, Gone: 3 }, location: 'Cebu City, call 0917 123 4567', work_hours: 'us', hours_per_week: 40,
    start_when: '1w', english: 'fluent', languages: 'Filipino', internet_mbps: 50, setup: ['backup_power', 'jetpack', 'headset'], show_resume: true });
  assert.equal(ok.status, 200);
  assert.deepEqual([ok.body.skill_years, ok.body.setup], [{ quickbooks: 5, excel: 2 }, ['backup_power', 'headset']]); // unknown skills and setup items dropped
  for (const bad of [{ work_hours: 'mars' }, { hours_per_week: 81 }, { english: 'klingon' }, { internet_mbps: 1.5 }])
    assert.equal((await save(bad)).status, 400, JSON.stringify(bad));
  assert.equal((await save({})).body.work_hours, 'us'); // fields left out are kept

  const asFree = (await call(`/workers/${w.user.id}`, { token: free.token }, 'GET')).body;
  assert.equal(asFree.location, `Cebu City, call ${HIDDEN}`); // contact details hidden from a Free employer
  assert.equal((await call(`/workers/${w.user.id}`, { token: pro.token }, 'GET')).body.location, 'Cebu City, call 0917 123 4567');

  // CV: none yet, then shared; Free employers are asked to upgrade, Pro gets the file, and the worker can hide it.
  const cv = (who) => call(`/workers/${w.user.id}/resume`, { token: who.token }, 'GET');
  assert.equal((await cv(pro)).status, 404);
  await pool.query("UPDATE worker_profiles SET resume_key = 'resumes/b.pdf', resume_name = 'b.pdf' WHERE user_id = $1", [w.user.id]);
  assert.equal((await call(`/workers/${w.user.id}`, { token: free.token }, 'GET')).body.has_resume, true);
  assert.equal((await cv(free)).body.code, 'upgrade');
  assert.match((await cv(pro)).body.url, /resumes\/b\.pdf/);
  await save({ show_resume: false });
  assert.equal((await cv(pro)).status, 404);
  assert.equal((await call(`/workers/${w.user.id}`, { token: pro.token }, 'GET')).body.has_resume, false);
});

test('email confirmation: 6-digit code on sign-up, required for everything, 5 tries, resend once a minute, change email, Google and reset confirm', async () => {
  const mails = [];
  app.locals.sendEmail = async (e) => { if (/is your ReadyToWork\.ph code$/.test(e.subject) || /^Welcome/.test(e.subject)) mails.push(e); };
  const reg = (email, role) => call('/auth/register', { email, password: 'password1', name: 'Conf', role, unconfirmed: true });
  const codeOf = (m) => m.text.match(/Your code: (\d{6})/)[1];
  const codes = () => mails.filter((m) => /code$/.test(m.subject));
  const allowResend = () => pool.query("UPDATE email_codes SET sent_at = now() - interval '2 minutes'");

  const boss = await reg('conf.boss@co.com', 'employer');
  const t = boss.body.token;
  assert.equal(boss.body.user.email_verified, false);
  assert.deepEqual(mails.map((m) => m.to), ['conf.boss@co.com']); // the code only; the welcome waits
  assert.match(codeOf(mails[0]), /^\d{6}$/);
  const job = { token: t, title: 'VA', description: 'x', job_type: 'gig' };
  // Nothing works before the code is entered, except the code screen's own routes.
  assert.equal((await call('/jobs', job)).body.code, 'verify_email');
  assert.equal((await call('/messages', { token: t }, 'GET')).body.code, 'verify_email');
  assert.equal((await call('/me', { token: t }, 'GET')).body.email_verified, false);

  // The code screen opening keeps a live code (no new email); with none left it sends one (below, after expiry).
  assert.equal((await call('/auth/verify/resend', { token: t, if_none: true })).body.sent, false);
  assert.equal(codes().length, 1);
  // Resend: not within a minute, then a new code replaces the old one.
  assert.equal((await call('/auth/verify/resend', { token: t }, 'POST')).status, 429);
  await allowResend();
  assert.equal((await call('/auth/verify/resend', { token: t }, 'POST')).body.verified, false);
  assert.equal(codes().length, 2);
  const [first, second] = codes().map(codeOf);
  const verify = (code) => call('/auth/verify', { token: t, code });
  if (first !== second) assert.equal((await verify(first)).body.code, 'wrong_code'); // the old code stopped working

  // 5 tries per code, then a new one is needed.
  const wrong = second === '000000' ? '111111' : '000000';
  let r;
  for (let i = codes().length === 2 && first !== second ? 1 : 0; i < 5; i++) r = await verify(wrong);
  assert.equal(r.body.code, 'expired');
  assert.equal((await verify(second)).body.code, 'expired'); // even the right code is too late now
  await allowResend();
  await call('/auth/verify/resend', { token: t }, 'POST');
  const ok = await verify(` ${codeOf(codes().at(-1)).replace(/(\d{3})/, '$1 ')} `); // spaces are fine
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.email_verified, true);
  assert.ok(mails.some((m) => /^Welcome/.test(m.subject) && m.to === 'conf.boss@co.com')); // welcome after confirming
  assert.equal((await call('/jobs', job)).status, 201);
  const before = codes().length;
  assert.equal((await call('/auth/verify/resend', { token: t }, 'POST')).body.verified, true);
  assert.equal(codes().length, before); // nothing to resend once confirmed
  assert.equal((await call('/auth/email', { token: t, email: 'other@co.com' }, 'PUT')).status, 403); // only before confirming

  // Change a mistyped email: the code goes to the new address; taken emails are refused.
  const typo = await reg('conf.typo@gmial.com', 'worker');
  assert.equal((await call('/auth/email', { token: typo.body.token, email: 'conf.boss@co.com' }, 'PUT')).status, 409);
  const fixed = await call('/auth/email', { token: typo.body.token, email: 'Conf.Typo@gmail.com' }, 'PUT');
  assert.equal(fixed.body.user.email, 'conf.typo@gmail.com');
  assert.equal(codes().at(-1).to, 'conf.typo@gmail.com');
  assert.equal((await call('/auth/verify', { token: typo.body.token, code: codeOf(codes().at(-1)) })).status, 200);

  // Google: confirmed on sign-up, and a confirmed account keeps its password when Google links to it.
  process.env.GOOGLE_CLIENT_ID = 'test-client';
  app.locals.verifyGoogle = async (t) => ({ 'conf-boss': { sub: 'g-conf', email: 'conf.boss@co.com', email_verified: true, name: 'Conf' },
    'conf-new': { sub: 'g-new', email: 'conf.new@gmail.com', email_verified: true, name: 'New' } })[t];
  assert.equal((await call('/auth/google', { credential: 'conf-new', role: 'worker' })).body.user.email_verified, true);
  assert.equal((await call('/auth/google', { credential: 'conf-boss' })).status, 200);
  assert.equal((await call('/auth/login', { email: 'conf.boss@co.com', password: 'password1' })).status, 200);

  // A password reset confirms the email too (the link went to that inbox).
  const w = await reg('conf.w@x.ph', 'worker');
  app.locals.sendEmail = capture;
  sent.length = 0;
  await fetch(`${base}/auth/forgot`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'conf.w@x.ph' }) });
  const token = sent[0].text.match(/reset-password\?token=([\w-]+)/)[1];
  const done = await (await fetch(`${base}/auth/reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password: 'password9' }) })).json();
  assert.equal(done.user.email_verified, true);
  assert.equal(w.body.user.email_verified, false);
});

test('change a confirmed email: password or a code to the old email, then a code to the new one; others signed out, old email told', async () => {
  const mails = [];
  app.locals.sendEmail = async (e) => { mails.push(e); };
  const codeTo = (to) => mails.filter((m) => m.to === to && isCode(m)).at(-1).text.match(/Your code: (\d{6})/)[1];
  const reg = await call('/auth/register', { email: 'move.w@x.ph', password: 'password1', name: 'Mover', role: 'worker' });
  const t = reg.body.token;
  await new Promise((r) => setTimeout(r, 1100)); // logins are stamped to the second
  const other = (await call('/auth/login', { email: 'move.w@x.ph', password: 'password1' })).body.token; // a second device
  await call('/auth/register', { email: 'taken@x.ph', password: 'password1', name: 'Taken', role: 'worker' });

  const start = (body) => call('/me/email', { token: t, ...body });
  assert.equal((await start({ email: 'new.w@x.ph', password: 'wrong-pass' })).body.code, 'wrong_password');
  assert.equal((await start({ email: 'taken@x.ph', password: 'password1' })).status, 409);
  assert.equal((await start({ email: 'move.w@x.ph', password: 'password1' })).status, 400); // same email
  assert.equal((await call('/me/email/reauth', { token: t }, 'POST')).status, 400); // has a password: no code needed
  assert.equal((await start({ email: 'New.W@x.ph', password: 'password1' })).body.email, 'new.w@x.ph');
  assert.equal((await call('/me', { token: t }, 'GET')).body.email, 'move.w@x.ph'); // nothing changes until the code
  assert.equal((await call('/me/email/resend', { token: t }, 'POST')).status, 429); // once a minute

  await new Promise((r) => setTimeout(r, 1100));
  const done = await call('/me/email/confirm', { token: t, code: codeTo('new.w@x.ph') });
  assert.equal(done.status, 200);
  assert.equal(done.body.user.email, 'new.w@x.ph');
  assert.equal((await call('/me', { token: done.body.token }, 'GET')).body.email, 'new.w@x.ph'); // this device: still in
  assert.equal((await call('/me', { token: other }, 'GET')).status, 401); // other devices: signed out
  assert.match(mails.find((m) => m.to === 'move.w@x.ph' && /was changed/.test(m.subject)).text, /n\*\*\*@x\.ph/);
  assert.equal((await call('/auth/login', { email: 'new.w@x.ph', password: 'password1' })).status, 200);
  assert.equal((await call('/me/email/confirm', { token: done.body.token, code: codeTo('new.w@x.ph') })).body.code, 'expired'); // one use

  // Google-only account (no password): a code to the current email proves it's them.
  process.env.GOOGLE_CLIENT_ID = 'test-client';
  app.locals.verifyGoogle = async () => ({ sub: 'g-move', email: 'move.g@gmail.com', email_verified: true, name: 'G Mover' });
  const g = (await call('/auth/google', { credential: 'x', role: 'employer' })).body.token;
  assert.equal((await call('/me/email', { token: g, email: 'move.g2@gmail.com', code: '123456' })).body.code, 'expired'); // no code asked for yet
  assert.equal((await call('/me/email/reauth', { token: g }, 'POST')).status, 200);
  const wrong = codeTo('move.g@gmail.com') === '000000' ? '111111' : '000000';
  assert.equal((await call('/me/email', { token: g, email: 'move.g2@gmail.com', code: wrong })).body.code, 'wrong_code');
  assert.equal((await call('/me/email', { token: g, email: 'move.g2@gmail.com', code: codeTo('move.g@gmail.com') })).status, 200);
  const gDone = await call('/me/email/confirm', { token: g, code: codeTo('move.g2@gmail.com') });
  assert.equal(gDone.body.user.email, 'move.g2@gmail.com');
  assert.equal((await call('/auth/google', { credential: 'x' })).status, 200); // Google sign-in still finds the account
});

test('delete my account: type DELETE, data and files gone, chats kept as "Deleted user", email free again, paid plan cancelled first', async () => {
  const reg = async (email, role, name) => (await call('/auth/register', { email, password: 'password1', name, role })).body;
  const boss = await reg('del.boss@co.com', 'employer', 'Del Boss');
  const w = await reg('del.w@x.ph', 'worker', 'Del Worker');
  const job = (await call('/jobs', { token: boss.token, title: 'Del job', description: 'x', job_type: 'gig' })).body;
  await call(`/jobs/${job.id}/apply`, { token: w.token, cover_letter: 'hi' });
  await call(`/messages/${w.user.id}`, { token: boss.token, body: 'Hi, thanks for applying', job_id: job.id });
  await call(`/messages/${boss.user.id}`, { token: w.token, body: 'Hello boss' });
  await pool.query("UPDATE users SET photo_key = 'photos/del.jpg' WHERE id = $1", [w.user.id]);
  await pool.query("UPDATE worker_profiles SET resume_key = 'resumes/del.pdf' WHERE user_id = $1", [w.user.id]);
  files.set('photos/del.jpg', 'x'); files.set('resumes/del.pdf', 'x');
  const del = (token, confirm) => call('/me', { token, confirm }, 'DELETE');

  assert.equal((await del(w.token, 'delete')).status, 400); // must type DELETE exactly
  assert.equal((await del(w.token, 'DELETE')).status, 204);
  assert.equal((await call('/me', { token: w.token }, 'GET')).status, 401); // signed out everywhere
  assert.equal((await call('/auth/login', { email: 'del.w@x.ph', password: 'password1' })).body.code, 'no_account');
  const apps = (await call(`/jobs/${job.id}/applications`, { token: boss.token }, 'GET')).body.applicants;
  assert.deepEqual(apps.map((a) => [a.name, a.deleted, a.cover_letter, a.analysis, a.resume_name]), [['Deleted user', true, '', null, null]]); // an anonymous trace
  assert.equal((await pool.query('SELECT 1 FROM worker_profiles WHERE user_id = $1', [w.user.id])).rowCount, 0);
  assert.deepEqual([files.has('photos/del.jpg'), files.has('resumes/del.pdf')], [false, false]);
  const inbox = (await call('/messages', { token: boss.token }, 'GET')).body;
  assert.equal(inbox.find((c) => c.user_id === w.user.id).name, 'Deleted user'); // the boss keeps the chat
  assert.equal((await call(`/messages/${w.user.id}`, { token: boss.token, body: 'still there?' })).status, 404); // can't write to them
  const thread = (await call(`/messages/${w.user.id}`, { token: boss.token }, 'GET')).body; // but the old chat still opens
  assert.deepEqual([thread.user.status, thread.can_send, thread.messages.length], ['deleted', false, 2]);
  assert.equal((await reg('del.w@x.ph', 'worker', 'Back Again')).user.name, 'Back Again'); // the email is free again, fresh account

  // A paid plan is cancelled at Paddle first; if Paddle fails, nothing is deleted.
  process.env.PADDLE_API_KEY = 'test-key';
  await pool.query("UPDATE users SET plan = 'pro', paddle_subscription_id = 'sub_del' WHERE id = $1", [boss.user.id]);
  const realFetch = globalThis.fetch;
  let cancelled = null;
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('/subscriptions/sub_del/cancel')) { cancelled = JSON.parse(opts.body); return new Response(JSON.stringify({ error: { code: 'x' } }), { status: 500 }); }
    return realFetch(url, opts);
  };
  // While PADDLE_TESTERS is set, only those emails can start a checkout (sandbox keys on the live site).
  Object.assign(process.env, { PADDLE_TESTERS: 'Someone.Else@x.ph', PADDLE_PRICE_PRO_MONTHLY: 'pri_pro' });
  assert.equal((await call('/billing/checkout', { token: boss.token, plan: 'pro' })).status, 403);
  delete process.env.PADDLE_TESTERS;

  assert.equal((await del(boss.token, 'DELETE')).status, 502);
  assert.equal((await pool.query('SELECT deleted_at FROM users WHERE id = $1', [boss.user.id])).rows[0].deleted_at, null);
  globalThis.fetch = async (url, opts) => (String(url).includes('/subscriptions/sub_del/cancel') ? new Response(JSON.stringify({ data: {} }), { status: 200 }) : realFetch(url, opts));
  assert.equal((await del(boss.token, 'DELETE')).status, 204);
  assert.deepEqual(cancelled, { effective_from: 'immediately' });
  assert.equal((await pool.query('SELECT 1 FROM jobs WHERE id = $1', [job.id])).rowCount, 0); // their jobs go too
  globalThis.fetch = realFetch;
  process.env.PADDLE_API_KEY = '';
});

test('names: first and last kept separately from sign-up and from Google', async () => {
  const w = await call('/auth/register', { email: 'names.w@x.ph', password: 'password1', first_name: 'Maria', last_name: 'Dela Cruz', role: 'worker' });
  assert.equal(w.body.user.name, 'Maria Dela Cruz');
  const row = async (email) => (await pool.query('SELECT name, first_name, last_name FROM users WHERE email = $1', [email])).rows[0];
  assert.deepEqual(await row('names.w@x.ph'), { name: 'Maria Dela Cruz', first_name: 'Maria', last_name: 'Dela Cruz' });
  await call('/auth/register', { email: 'names.old@x.ph', password: 'password1', name: 'Juan Santos Reyes', role: 'worker' }); // one field
  assert.deepEqual(await row('names.old@x.ph'), { name: 'Juan Santos Reyes', first_name: 'Juan', last_name: 'Santos Reyes' });
  process.env.GOOGLE_CLIENT_ID = 'test-client';
  app.locals.verifyGoogle = async () => ({ sub: 'g-names', email: 'names.g@gmail.com', email_verified: true, name: 'Ana Lim', given_name: 'Ana', family_name: 'Lim' });
  await call('/auth/google', { credential: 'x', role: 'worker' });
  assert.deepEqual(await row('names.g@gmail.com'), { name: 'Ana Lim', first_name: 'Ana', last_name: 'Lim' });

  // changing your name later
  const put = (body, token = w.body.token) => call('/me', { token, ...body }, 'PUT');
  assert.equal((await put({ first_name: 'Maria', last_name: 'Santos' })).body.name, 'Maria Santos');
  assert.deepEqual(await row('names.w@x.ph'), { name: 'Maria Santos', first_name: 'Maria', last_name: 'Santos' });
  assert.equal((await put({ name: '  ' })).status, 400);
  const boss = (await call('/auth/register', { email: 'names.co@x.ph', password: 'password1', name: 'Acme', role: 'employer' })).body;
  assert.equal((await put({ name: 'Acme Outsourcing Inc.' }, boss.token)).body.name, 'Acme Outsourcing Inc.');
  assert.equal((await call('/me', { name: 'x' }, 'PUT')).status, 401);
});

test('deactivate: hidden from search, jobs and new messages; history kept; logging in reactivates', async () => {
  const reg = async (email, role, name) => (await call('/auth/register', { email, password: 'password1', name, role })).body;
  const boss = await reg('pause.boss@co.com', 'employer', 'Pause Boss');
  const w = await reg('pause.w@x.ph', 'worker', 'Pause Worker');
  await call('/profile', { token: w.token, title: 'Pausebookkeeper', bio: 'x', skills: 'books', availability: 'gig' }, 'PUT');
  const job = (await call('/jobs', { token: boss.token, title: 'Pausejob', description: 'x', job_type: 'gig' })).body;
  await call(`/jobs/${job.id}/apply`, { token: w.token, cover_letter: 'hi' });
  await call(`/messages/${w.user.id}`, { token: boss.token, body: 'Hello', job_id: job.id });
  await pool.query("UPDATE users SET plan = 'pro' WHERE id = $1", [boss.user.id]); // may search talent

  assert.equal((await call('/me/deactivate', { token: w.token }, 'POST')).status, 204);
  assert.equal((await call('/me', { token: w.token }, 'GET')).status, 401); // signed out
  assert.equal((await call('/workers?q=Pausebookkeeper', { token: boss.token }, 'GET')).body.total, 0); // out of search
  const apps = (await call(`/jobs/${job.id}/applications`, { token: boss.token }, 'GET')).body.applicants;
  assert.deepEqual(apps.map((a) => [a.name, a.deactivated, a.cover_letter]), [['Pause Worker', true, 'hi']]); // everything kept, flagged
  assert.equal((await call(`/messages/${w.user.id}`, { token: boss.token, body: 'Hi again' })).status, 403); // no new messages
  assert.equal((await call(`/messages/${w.user.id}`, { token: boss.token }, 'GET')).body.user.status, 'deactivated');

  const back = await call('/auth/login', { email: 'pause.w@x.ph', password: 'password1' });
  assert.equal(back.body.reactivated, true);
  assert.equal((await call('/workers?q=Pausebookkeeper', { token: boss.token }, 'GET')).body.total, 1);
  assert.equal((await call('/auth/login', { email: 'pause.w@x.ph', password: 'password1' })).body.reactivated, false);

  // A paused employer's jobs leave the job list and stop taking applications.
  await call('/me/deactivate', { token: boss.token }, 'POST');
  assert.equal((await call('/jobs?q=Pausejob', {}, 'GET')).body.length, 0);
  const w2 = await reg('pause.w2@x.ph', 'worker', 'Other Worker');
  assert.notEqual((await call(`/jobs/${job.id}/apply`, { token: w2.token, cover_letter: 'hi' })).status, 201);
});

test('job posts: emails, links, phones and @handles hidden from visitors only; ordinary numbers stay', async () => {
  const { MEMBERS_ONLY } = await import('../src/lib/contacts.js');
  const boss = (await call('/auth/register', { email: 'mask.jobs@co.com', password: 'password1', name: 'Mask Jobs Co', role: 'employer' })).body;
  const description = 'Apply at hire@acme.com, see acme.com/jobs or https://t.me/acmehr, WhatsApp +63 917 123 4567 or @acme_hr. Pay $900-$1,300, 2024-2025 season, 40 hrs.';
  const job = (await call('/jobs', { token: boss.token, title: 'Masked VA', description, job_type: 'gig' })).body;
  const visitor = (await call(`/jobs/${job.id}`, {}, 'GET')).body;
  assert.equal(visitor.description, `Apply at ${MEMBERS_ONLY}, see ${MEMBERS_ONLY} or ${MEMBERS_ONLY}, WhatsApp ${MEMBERS_ONLY} or ${MEMBERS_ONLY}. Pay $900-$1,300, 2024-2025 season, 40 hrs.`);
  assert.ok(!(await call('/jobs?q=Masked', {}, 'GET')).body[0].description.includes('acme')); // the list API too
  const w = (await call('/auth/register', { email: 'mask.reader@x.ph', password: 'password1', name: 'Reader', role: 'worker' })).body;
  assert.equal((await call(`/jobs/${job.id}`, { token: w.token }, 'GET')).body.description, description); // members see it all
});

test('admin suspends an account: signed out, can’t log in, hidden, email blocked from signing up again; lifting it undoes that', async () => {
  const { signAdminToken } = await import('../src/middleware/auth.js');
  const admin = signAdminToken();
  const reg = async (email, role, name) => (await call('/auth/register', { email, password: 'password1', name, role })).body;
  const scam = await reg('scam.boss@co.com', 'employer', 'Scam Co');
  const job = (await call('/jobs', { token: scam.token, title: 'Scamjob easy money', description: 'x', job_type: 'gig' })).body;
  const w = await reg('susp.w@x.ph', 'worker', 'Susp Worker');
  const suspend = (on) => call(`/admin/users/${scam.user.id}/suspend`, { token: admin, suspended: on }, 'PUT');

  assert.equal((await call(`/admin/users/${scam.user.id}/suspend`, { token: w.token, suspended: true }, 'PUT')).status, 401); // admins only
  assert.ok((await suspend(true)).body.suspended_at);
  assert.equal((await call('/me', { token: scam.token }, 'GET')).status, 401); // signed out everywhere
  assert.equal((await call('/auth/login', { email: 'scam.boss@co.com', password: 'password1' })).body.code, 'suspended');
  assert.equal((await call('/jobs?q=Scamjob', {}, 'GET')).body.length, 0); // their jobs are hidden
  assert.notEqual((await call(`/jobs/${job.id}/apply`, { token: w.token, cover_letter: 'hi' })).status, 201);
  assert.equal((await call('/admin/users?q=scam.boss', { token: admin }, 'GET')).body.users[0].suspended_at !== null, true);

  // Deleting their account doesn't free the email: it stays blocked.
  await pool.query("UPDATE users SET email = 'deleted-x@deleted.invalid', deleted_at = now() WHERE id = $1", [scam.user.id]);
  assert.equal((await call('/auth/register', { email: 'scam.boss@co.com', password: 'password1', name: 'Again', role: 'employer' })).body.code, 'blocked');
  process.env.GOOGLE_CLIENT_ID = 'test-client';
  app.locals.verifyGoogle = async () => ({ sub: 'g-scam', email: 'scam.boss@co.com', email_verified: true, name: 'Scam' });
  assert.equal((await call('/auth/google', { credential: 'x', role: 'employer' })).body.code, 'blocked');

  // Lifting a suspension on a live account lets them back in.
  const other = await reg('susp.lift@co.com', 'employer', 'Lift Co');
  await call(`/admin/users/${other.user.id}/suspend`, { token: admin, suspended: true }, 'PUT');
  assert.equal((await call('/auth/login', { email: 'susp.lift@co.com', password: 'password1' })).body.code, 'suspended');
  await call(`/admin/users/${other.user.id}/suspend`, { token: admin, suspended: false }, 'PUT');
  assert.equal((await call('/auth/login', { email: 'susp.lift@co.com', password: 'password1' })).status, 200);
});

test('find matches: the AI agent searches, reads profiles, shortlists only real workers; plan allowance, one run at a time, saved', async () => {
  const reg = async (email, role, name) => (await call('/auth/register', { email, password: 'password1', name, role })).body;
  const boss = await reg('fm.boss@co.com', 'employer', 'FM Boss');
  const job = (await call('/jobs', { token: boss.token, title: 'Zebrashop store assistant', description: 'Shopify support, US hours',
    skills: ['zebrashop'], job_type: 'full-time', salary_min: 5, salary_max: 8, salary_period: 'hour' })).body;
  const mk = async (n, profile) => {
    const w = await reg(`fm.w${n}@x.ph`, 'worker', `Fm${n} Reyes`);
    await call('/profile', { token: w.token, bio: 'x', ...profile }, 'PUT');
    return w.user.id;
  };
  const strong = await mk(1, { title: 'Zebrashop VA', skills: ['zebrashop'], hourly_rate: '12', availability: 'full-time' });
  const ok = await mk(2, { title: 'Zebrashop helper', skills: ['zebrashop'], hourly_rate: '6', availability: 'part-time' });
  const paused = await mk(3, { title: 'Zebrashop pro', skills: ['zebrashop'], hourly_rate: '6' });
  await pool.query('UPDATE users SET deactivated_at = now() WHERE id = $1', [paused]);

  // Streams the run (Server-Sent Events) and returns every event.
  const run = async (token = boss.token) => {
    const res = await fetch(`${base}/jobs/${job.id}/matches`, { method: 'POST', headers: asCookie(token) });
    if (!res.headers.get('content-type')?.includes('event-stream')) return { status: res.status, body: await res.json() };
    const events = (await res.text()).split('\n\n').filter(Boolean).map((e) => JSON.parse(e.replace(/^data: /, '')));
    return { status: res.status, events };
  };

  // Free plan: upgrade first.
  const free = await run();
  assert.deepEqual([free.status, free.body.upgrade], [402, true]);
  await pool.query("UPDATE users SET plan = 'pro' WHERE id = $1", [boss.user.id]);

  // A scripted model: search, read two profiles (one it never found), then submit with an invented id and a reason holding an email.
  const calls = [];
  const reply = (...blocks) => ({ stop_reason: 'tool_use', usage: { input_tokens: 100, output_tokens: 20 }, content: blocks });
  const use = (id, name, input) => ({ type: 'tool_use', id, name, input });
  const script = [
    () => reply({ type: 'text', text: 'Searching the core skill first.' }, use('t1', 'search_workers', { query: 'zebrashop' })),
    (m) => {
      const found = JSON.parse(m.at(-1).content[0].content).workers.map((w) => w.id);
      assert.deepEqual(found.sort(), [strong, ok].sort()); // the paused worker isn't searchable
      return reply(use('t2', 'get_worker_profile', { worker_id: strong }), use('t3', 'get_worker_profile', { worker_id: paused }));
    },
    (m) => {
      const [profile, refused] = m.at(-1).content;
      assert.equal(JSON.parse(profile.content).id, strong);
      assert.equal(refused.is_error, true); // only workers a search returned
      return reply(use('t4', 'submit_shortlist', { summary: 'Two fit.', matches: [
        { worker_id: strong, score: 91, reason: 'Years of zebrashop; reach me at strong@x.ph' },
        { worker_id: 424242, score: 99, reason: 'Invented person' },
        { worker_id: ok, score: 70, reason: 'Part-time only' },
      ] }));
    },
  ];
  app.locals.matchModel = async (params) => { calls.push(params); return script[calls.length - 1](params.messages); };

  const first = await run();
  assert.equal(first.status, 200);
  assert.deepEqual(first.events.map((e) => e.type), ['start', 'thought', 'search', 'profile', 'done', 'result']);
  const result = first.events.at(-1);
  assert.deepEqual(result.run.matches.map((m) => m.worker.id), [strong, ok]); // the invented id is dropped
  assert.equal(result.run.matches[0].reason.includes('strong@x.ph'), false); // contact details never shown
  assert.deepEqual(result.run.matches.map((m) => m.over_budget), [true, false]); // $12/hr above the $8 budget
  assert.deepEqual([result.usage.used, result.usage.limit], [1, 3]);
  assert.equal(calls[0].tool_choice.type, 'auto');

  // Saved: coming back shows the same run and its steps.
  const back = (await call(`/jobs/${job.id}/matches`, { token: boss.token }, 'GET')).body;
  assert.deepEqual([back.run.id, back.run.status, back.run.matches.length, back.run.steps.length], [result.run.id, 'done', 2, 4]);
  assert.equal(back.budget, '$5-8 per hour');

  // One run at a time per employer.
  await pool.query("INSERT INTO match_runs (job_id, employer_id) VALUES ($1, $2)", [job.id, boss.user.id]);
  assert.equal((await run()).status, 409);
  await pool.query("UPDATE match_runs SET created_at = now() - interval '10 minutes' WHERE status = 'running'"); // stale: interrupted, not counted

  // A model that keeps searching is made to submit on the last turn; a failing model isn't counted.
  calls.length = 0;
  app.locals.matchModel = async (params) => {
    calls.push(params);
    return params.tool_choice.type === 'tool'
      ? reply(use('s', 'submit_shortlist', { summary: 'Done.', matches: [] }))
      : reply(use(`q${calls.length}`, 'search_workers', { query: 'zebrashop' }));
  };
  const capped = await run();
  assert.equal(calls.length, 8);
  assert.deepEqual(calls.at(-1).tool_choice, { type: 'tool', name: 'submit_shortlist' });
  assert.equal(capped.events.at(-1).run.matches.length, 0);
  app.locals.matchModel = async () => { throw new Error('AI down'); };
  assert.equal((await run()).events.at(-1).type, 'error');
  const usage = (await call(`/jobs/${job.id}/matches`, { token: boss.token }, 'GET')).body.usage;
  assert.equal(usage.used, 2); // the interrupted and the failed runs don't count

  // Pro's 3 a month: the next one finishes the allowance, then upgrade.
  app.locals.matchModel = async () => reply(use('s', 'submit_shortlist', { summary: 'x', matches: [] }));
  assert.equal((await run()).status, 200);
  const out = await run();
  assert.deepEqual([out.status, out.body.upgrade], [402, true]);

  // Only the job's owner.
  const other = await reg('fm.other@co.com', 'employer', 'Other');
  assert.equal((await call(`/jobs/${job.id}/matches`, { token: other.token }, 'GET')).status, 404);
  app.locals.matchModel = async () => { throw new Error('match model not stubbed'); };
});


test('new applicants 🔔: counts per job since the employer last opened its applicants', async () => {
  const reg = async (email, role) => (await call('/auth/register', { email, password: 'password1', name: 'N ' + role, role })).body;
  const boss = await reg('bell.boss@co.com', 'employer');
  const [w1, w2] = [await reg('bell.w1@x.ph', 'worker'), await reg('bell.w2@x.ph', 'worker')];
  const job = (await call('/jobs', { token: boss.token, title: 'Bell job', description: 'x', job_type: 'gig' })).body;
  const bell = async () => (await call('/my/new-applicants', { token: boss.token }, 'GET')).body;
  assert.deepEqual(await bell(), { count: 0, jobs: [] });

  await call(`/jobs/${job.id}/apply`, { token: w1.token, cover_letter: 'Hi' });
  await call(`/jobs/${job.id}/apply`, { token: w2.token, cover_letter: 'Hi' });
  let b = await bell();
  assert.deepEqual([b.count, b.jobs[0].id, b.jobs[0].title, b.jobs[0].count], [2, job.id, 'Bell job', 2]);

  const recent = (await call('/my/recent-applicants', { token: boss.token }, 'GET')).body;
  assert.deepEqual(recent.map((r) => [r.worker_id, r.job_title]), [[w2.user.id, 'Bell job'], [w1.user.id, 'Bell job']]); // newest first
  await call(`/jobs/${job.id}/applications`, { token: boss.token }, 'GET'); // opened: seen
  assert.equal((await bell()).count, 0);
  assert.equal((await call('/my/new-applicants', { token: w1.token }, 'GET')).status, 403); // employers only
});

test('applicants page: all jobs in one list; bulk message sends one message to each, only to your own applicants', async () => {
  const reg = async (email, role, name) => (await call('/auth/register', { email, password: 'password1', name, role })).body;
  const boss = await reg('bulk.boss@co.com', 'employer', 'Bulk Boss');
  const other = await reg('bulk.other@co.com', 'employer', 'Other Boss');
  const [a, b, c] = [await reg('bulk.a@x.ph', 'worker', 'Ana A'), await reg('bulk.b@x.ph', 'worker', 'Ben B'), await reg('bulk.c@x.ph', 'worker', 'Cy C')];
  const job1 = (await call('/jobs', { token: boss.token, title: 'Job One', description: 'x', job_type: 'gig' })).body;
  const job2 = (await call('/jobs', { token: boss.token, title: 'Job Two', description: 'x', job_type: 'gig' })).body;
  const theirs = (await call('/jobs', { token: other.token, title: 'Not yours', description: 'x', job_type: 'gig' })).body;
  await call(`/jobs/${job1.id}/apply`, { token: a.token, cover_letter: 'Hi' });
  await call(`/jobs/${job2.id}/apply`, { token: b.token, cover_letter: 'Hi' });
  const stranger = (await call(`/jobs/${theirs.id}/apply`, { token: c.token, cover_letter: 'Hi' })).body;

  assert.deepEqual((await call('/my/post-usage', { token: boss.token }, 'GET')).body, { used: 2, limit: 3 });
  const list = (await call('/my/applicants', { token: boss.token }, 'GET')).body;
  assert.deepEqual(list.applicants.map((r) => [r.name, r.job_title, r.is_new, r.messaged]), [['Ben B', 'Job Two', true, false], ['Ana A', 'Job One', true, false]]);
  assert.equal((await call('/my/new-applicants', { token: boss.token }, 'GET')).body.count, 0); // opening the list clears the 🔔

  const ids = [...list.applicants.map((r) => r.id), stranger.id]; // someone else's applicant is ignored
  assert.equal((await call('/messages/bulk', { token: boss.token, application_ids: ids, body: '' })).status, 400);
  const sent = await call('/messages/bulk', { token: boss.token, application_ids: ids, body: 'Thanks for applying! Free for a call?' });
  assert.deepEqual([sent.status, sent.body.sent], [201, 2]);
  const { rows } = await pool.query('SELECT recipient_id, job_id FROM messages WHERE sender_id = $1 ORDER BY recipient_id', [boss.user.id]);
  assert.deepEqual(rows, [{ recipient_id: a.user.id, job_id: job1.id }, { recipient_id: b.user.id, job_id: job2.id }]);
  assert.ok((await call('/my/applicants', { token: boss.token }, 'GET')).body.applicants.every((r) => r.messaged && !r.is_new));
  assert.equal((await call('/messages/bulk', { token: a.token, application_ids: ids, body: 'x' })).status, 403); // employers only
});

test('Hire Talent search: every word must appear in title, bio or skills (any order, whole words, never the resume)', async () => {
  const { searchWords } = await import('../src/lib/search.js');
  assert.deepEqual(searchWords('AI  engineer, c++'), ['\\mai\\M', '\\mengineer', '\\mc\\+\\+']);
  for (const q of ['full stack', 'Full-Stack', 'fullstack']) assert.deepEqual(searchWords(`${q} dev`), ['\\mfull[\\s-]?stack', '\\mdev\\M']);
  const reg = async (email, role, name) => (await call('/auth/register', { email, password: 'password1', name, role })).body;
  const boss = await reg('srch.boss@co.com', 'employer', 'Search Boss');
  const mk = async (email, name, profile) => {
    const w = await reg(email, 'worker', name);
    await call('/profile', { token: w.token, availability: 'full-time', skills: [], bio: '', ...profile }, 'PUT');
    return w.user.id;
  };
  const exact = await mk('srch.1@x.ph', 'Exact One', { title: 'Zqx AI Engineer' });
  const split = await mk('srch.2@x.ph', 'Split Two', { title: 'Zqx Engineering lead', skills: ['ai'] });
  const email = await mk('srch.3@x.ph', 'Email Three', { title: 'Zqx Email support engineer', bio: 'I maintain inboxes' }); // "ai" only inside other words
  const half = await mk('srch.4@x.ph', 'Half Four', { title: 'Zqx AI trainer' });
  const ids = async (q) => (await call(`/workers?q=${encodeURIComponent(q)}`, { token: boss.token }, 'GET')).body.workers.map((w) => w.id);
  assert.deepEqual(await ids('zqx ai engineer'), [exact, split]); // title matches rank first
  assert.ok(!(await ids('zqx ai')).includes(email));
  assert.ok((await ids('zqx ai')).includes(half));
  assert.deepEqual((await ids('engineer zqx')).sort(), [exact, split, email].sort()); // "engineer" also finds Engineering
});

test('admin testing zone: admin only, PDFs only, scores with Vertex AI or Anthropic and saves nothing', async () => {
  const { signAdminToken } = await import('../src/middleware/auth.js');
  const cookie = { cookie: `rw_admin=${signAdminToken()}` };
  const pdf = (body) => fetch(`${base}/admin/testing/resume-text`, { method: 'POST', headers: { 'content-type': 'application/pdf', ...cookie }, body });
  assert.equal((await call('/admin/testing/score', { title: 'VA', description: 'x' })).status, 401);
  assert.equal((await pdf(Buffer.from('not a pdf'))).status, 400);

  const fakeVertex = { name: 'vertex' };
  app.locals.vertexClient = () => fakeVertex;
  const used = [];
  app.locals.analyzeApplication = async ({ job, applicant }, ai) => {
    used.push([job.title, applicant.resume_text, ai]);
    return { score: 77, verdict: 'ok', strengths: [], concerns: [], usage: { input_tokens: 10, output_tokens: 2 } };
  };
  const score = (body) => fetch(`${base}/admin/testing/score`, { method: 'POST', headers: { 'content-type': 'application/json', ...cookie }, body: JSON.stringify(body) });
  assert.equal((await score({ title: '', description: '' })).status, 400);
  const v = await (await score({ title: 'VA', description: 'Inbox and calendar', resume_text: 'Gmail expert' })).json();
  assert.deepEqual([v.provider, v.score, v.usage.input_tokens], ['vertex', 77, 10]);
  await score({ title: 'VA', description: 'Inbox', provider: 'anthropic' });
  assert.deepEqual(used.map((u) => u[2]), [fakeVertex, undefined]); // undefined = the normal Anthropic client
  assert.deepEqual(used[0].slice(0, 2), ['VA', 'Gmail expert']);
});

test('visitors: the site reports homepage visits (no other pages, no bots); only the admin sees them', async () => {
  const track = (body, ua = 'Mozilla/5.0 (iPhone) Safari/604.1') => fetch(`${base}/track`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': ua, 'cf-ipcountry': 'PH' }, body: JSON.stringify(body),
  });
  const w = (await call('/auth/register', { email: 'visit.w@x.ph', password: 'password1', name: 'Vee Visitor', role: 'worker' })).body;
  await track({ path: '/', referrer: 'https://google.com/' });
  await fetch(`${base}/track`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 (Windows) Chrome/120', 'cf-ipcountry': 'PH', ...asCookie(w.token) }, body: JSON.stringify({ path: '/' }) });
  await track({ path: '/jobs' }); // other pages: not counted
  await track({ path: '/admin/users' }); // not counted
  await track({ path: '/' }, 'Googlebot/2.1'); // not counted
  await track({ path: 'not-a-path' }); // ignored

  assert.equal((await call('/admin/visitors', {}, 'GET')).status, 401);
  const { signAdminToken } = await import('../src/middleware/auth.js');
  const v = (await call('/admin/visitors', { token: signAdminToken() }, 'GET')).body;
  assert.deepEqual(v.visits.map((r) => [r.path, r.country, r.device, r.user_name]), [['/', 'PH', 'Desktop · Chrome', 'Vee Visitor'], ['/', 'PH', 'Mobile · Safari', null]]);
  assert.equal(v.visits[1].referrer, 'https://google.com/');
  assert.ok(v.visits[0].ip);
  assert.deepEqual([v.totals.views_24h, v.total], [2, 2]);
  assert.deepEqual(v.pages.map((p) => [p.path, p.views]), [['/', 2]]);
  // Periods: 30 days unless asked; an older visit only shows under "Last 6 months".
  await pool.query("UPDATE page_views SET at = now() - interval '60 days' WHERE user_id IS NULL");
  const period = async (range) => (await call(`/admin/visitors${range ? `?range=${range}` : ''}`, { token: signAdminToken() }, 'GET')).body;
  assert.deepEqual([(await period()).range, (await period()).total, (await period('7d')).total, (await period('6m')).total], ['30d', 1, 1, 2]);
  assert.equal((await period('bogus')).range, '30d');
  await pool.query("UPDATE page_views SET at = now() WHERE user_id IS NULL");

  // "Don't count my IP": the admin's own IP (here, every test request's) is hidden, then never recorded.
  const admin = signAdminToken();
  const visits = async () => (await call('/admin/visitors', { token: admin }, 'GET')).body;
  const stored = async () => (await pool.query('SELECT count(*)::int AS n FROM page_views')).rows[0].n;
  assert.equal((await call('/admin/ignored-ips', { token: admin, ip: 'not-an-ip' })).status, 400);
  const mine = await call('/admin/ignored-ips', { token: admin, label: 'My laptop' });
  assert.equal(mine.status, 201);
  const after = await visits();
  assert.deepEqual([after.total, after.totals.views_24h, after.ignored.map((x) => x.label), after.my_ip_ignored], [0, 0, ['My laptop'], true]);
  const before = await stored();
  await track({ path: '/' });
  assert.equal(await stored(), before); // not recorded at all
  assert.equal((await call('/admin/ignored-ips', { token: admin, ip: '2001:db8:1:2:aaaa::1' })).body.net, '2001:db8:1:2::/64'); // IPv6: its /64
  assert.equal((await call('/admin/ignored-ips', { token: admin, net: mine.body.net }, 'DELETE')).status, 204);
  assert.equal((await visits()).total, 2); // shown again
});

test('admin user page: confirm email, new code, plan by hand (not over Paddle), delete on request; all logged', async () => {
  const { signAdminToken } = await import('../src/middleware/auth.js');
  const admin = signAdminToken();
  const boss = (await call('/auth/register', { email: 'au.boss@co.com', password: 'password1', name: 'AU Boss', role: 'employer', unconfirmed: true })).body;
  const id = boss.user.id;
  assert.equal((await call(`/admin/users/${id}`, {}, 'GET')).status, 401);
  const page = async () => (await call(`/admin/users/${id}`, { token: admin }, 'GET')).body;
  assert.equal((await page()).user.email, 'au.boss@co.com');

  const codes = [];
  app.locals.sendEmail = async (e) => { if (isCode(e)) codes.push(e.to); };
  assert.equal((await call(`/admin/users/${id}/resend-code`, { token: admin }, 'POST')).status, 204);
  assert.deepEqual(codes, ['au.boss@co.com']); // no once-a-minute wait for the admin
  app.locals.sendEmail = capture;
  assert.equal((await call(`/admin/users/${id}/confirm-email`, { token: admin }, 'POST')).status, 204);
  assert.equal((await call(`/admin/users/${id}/confirm-email`, { token: admin }, 'POST')).status, 409); // already
  assert.ok((await page()).user.email_verified_at);

  assert.equal((await call(`/admin/users/${id}/plan`, { token: admin, plan: 'gold' }, 'PUT')).status, 400);
  assert.equal((await call(`/admin/users/${id}/plan`, { token: admin, plan: 'pro' }, 'PUT')).body.plan, 'pro');
  await pool.query("UPDATE users SET paddle_subscription_id = 'sub_x' WHERE id = $1", [id]);
  assert.match((await call(`/admin/users/${id}/plan`, { token: admin, plan: 'free' }, 'PUT')).body.error, /Paddle/);
  await pool.query('UPDATE users SET paddle_subscription_id = NULL WHERE id = $1', [id]);

  assert.equal((await call(`/admin/users/${id}`, { token: admin, confirm: 'nope' }, 'DELETE')).status, 400);
  assert.equal((await call(`/admin/users/${id}`, { token: admin, confirm: 'DELETE' }, 'DELETE')).status, 204);
  const after = await page();
  assert.ok(after.user.deleted_at);
  assert.deepEqual(after.actions.map((a) => a.action), ['Deleted the account', 'Changed the plan', 'Confirmed the email by hand', 'Sent a new confirmation code']);
  assert.equal((await call(`/admin/users/${id}/plan`, { token: admin, plan: 'pro' }, 'PUT')).status, 409); // deleted
});

test('email everyone: only reachable people, test copy, exact count, no double send, one-click unsubscribe', async () => {
  const { signAdminToken } = await import('../src/middleware/auth.js');
  const admin = signAdminToken();
  const reg = async (email, role, extra = {}) => (await call('/auth/register', { email, password: 'password1', name: `Bc ${role}`, role, ...extra })).body;
  const [w1, w2] = [await reg('bc.w1@x.ph', 'worker'), await reg('bc.w2@x.ph', 'worker')];
  await reg('bc.unconfirmed@x.ph', 'worker', { unconfirmed: true }); // never emailed
  const batches = [];
  app.locals.sendBatch = async (emails) => { batches.push(emails); };
  app.locals.sendEmail = capture;
  process.env.ADMIN_EMAIL = 'admin@test.ph';
  const count = async () => (await call('/admin/broadcasts', { token: admin }, 'GET')).body.counts.workers;
  const workers = await count();
  assert.ok(workers >= 2);

  const msg = { token: admin, audience: 'workers', subject: 'New: job alerts', body: 'Hello!\n\nWe added job alerts.' };
  sent.length = 0;
  assert.equal((await call('/admin/broadcasts', { ...msg, test: true })).body.to, 'admin@test.ph');
  assert.match(sent[0].subject, /^\[Test\]/);
  assert.equal((await call('/admin/broadcasts', { ...msg, confirm: workers + 5 })).status, 409); // stale count
  assert.equal((await call('/admin/broadcasts', { ...msg, confirm: workers })).body.sent, workers);
  const all = batches.flat();
  assert.ok(!all.some((e) => e.to === 'bc.unconfirmed@x.ph'));
  const mine = all.find((e) => e.to === 'bc.w1@x.ph');
  assert.match(mine.html, /Hi Bc,/);
  assert.equal(mine.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.equal((await call('/admin/broadcasts', { ...msg, confirm: workers })).status, 409); // same email twice

  // Unsubscribe with the link from the email (Gmail's one-click POSTs to the same address).
  const [, u, t] = mine.headers['List-Unsubscribe'].match(/\?u=(\d+)&t=(\w+)/);
  assert.equal((await fetch(`${base}/unsubscribe?u=${u}&t=bad`, { method: 'POST' })).status, 400);
  assert.equal((await fetch(`${base}/unsubscribe?u=${u}&t=${t}`, { method: 'POST', body: 'List-Unsubscribe=One-Click', headers: { 'content-type': 'application/x-www-form-urlencoded' } })).status, 200);
  assert.equal(await count(), workers - 1);
  assert.equal((await call('/unsubscribe', { u: Number(u), t, on: true })).body.subscribed, true); // and back
  assert.equal(await count(), workers);
  assert.ok(w2);
});

test('support: reply by email, their answer joins the ticket and reopens it; new emails start tickets; loops and repeats skipped', async () => {
  const { signAdminToken } = await import('../src/middleware/auth.js');
  const admin = signAdminToken();
  app.locals.sendEmail = capture;
  const ticket = (await call('/contact', { name: 'Rosa', email: 'rosa@mail.ph', subject: 'Refund', message: 'How do refunds work?' })).body.id;
  sent.length = 0;
  assert.equal((await call(`/admin/feedback/${ticket}/reply`, { token: admin, body: 'Hi! Refunds take 5 days.', resolve: true })).status, 201);
  assert.equal(sent[0].to, 'rosa@mail.ph');
  assert.equal(sent[0].subject, `Re: Refund [#${ticket}]`);
  const view = async () => (await call(`/admin/feedback/${ticket}`, { token: admin }, 'GET')).body;
  assert.ok((await view()).done_at); // resolved

  const inbound = (body, secret = 'in-secret') => fetch(`${base}/support/inbound`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-inbound-secret': secret }, body: JSON.stringify(body) });
  assert.equal((await inbound({})).status, 503); // not set up
  process.env.INBOUND_SECRET = 'in-secret';
  try {
    assert.equal((await inbound({}, 'wrong')).status, 403);
    const answer = { from: 'Rosa@Mail.ph', subject: `Re: Re: Refund [#${ticket}]`, text: 'Thanks! One more question.\n\nOn Mon, Oct 20, 2026 at 9:00 AM ReadyToWork.ph wrote:\n> Hi! Refunds take 5 days.', message_id: '<a1@mail>' };
    assert.equal((await (await inbound(answer)).json()).ticket, ticket);
    await inbound(answer); // delivered twice: added once
    const t = await view();
    assert.deepEqual(t.messages.map((m) => [m.from_admin, m.body]), [[true, 'Hi! Refunds take 5 days.'], [false, 'Thanks! One more question.']]);
    assert.equal(t.done_at, null); // reopened

    // Someone else using the ticket number doesn't get into it; a fresh email starts its own ticket.
    const other = await (await inbound({ from: 'eve@x.ph', subject: `[#${ticket}] hi`, text: 'sneaky', message_id: '<e1@x>' })).json();
    assert.notEqual(other.ticket, ticket);
    assert.equal((await call(`/admin/feedback/${other.ticket}`, { token: admin }, 'GET')).body.type, 'email');
    for (const from of ['hello@readytowork.ph', 'MAILER-DAEMON@x.com']) assert.equal((await (await inbound({ from, subject: 'x', text: 'y' })).json()).skipped, true);
  } finally {
    delete process.env.INBOUND_SECRET;
  }
});

test('Team messages: admin writes, it arrives in Messages and by email, replies come back; nobody can be the Team account', async () => {
  const { signAdminToken } = await import('../src/middleware/auth.js');
  const admin = signAdminToken();
  const w = (await call('/auth/register', { email: 'tm.w@x.ph', password: 'password1', name: 'Tina Worker', role: 'worker' })).body;
  const mails = [];
  app.locals.sendEmail = async (e) => { if (!isCode(e)) mails.push(e); };
  assert.equal((await call(`/admin/users/${w.user.id}/message`, { token: admin, body: '' })).status, 400);
  assert.equal((await call(`/admin/users/${w.user.id}/message`, { token: admin, body: 'Hi Tina, your profile looks great!' })).status, 201);
  assert.equal(mails[0].to, 'tm.w@x.ph');
  assert.match(mails[0].subject, /New message from ReadyToWork\.ph Team/);

  const inbox = (await call('/messages', { token: w.token }, 'GET')).body;
  assert.deepEqual([inbox[0].name, inbox[0].role], ['ReadyToWork.ph Team', 'team']);
  const team = inbox[0].user_id;
  assert.equal((await call(`/messages/${team}`, { token: w.token }, 'GET')).body.can_send, true); // they can answer
  await call(`/messages/${team}`, { token: w.token, body: 'Thank you!' });
  const list = (await call('/admin/messages', { token: admin }, 'GET')).body;
  assert.deepEqual([list[0].user_id, list[0].unread, list[0].from_team], [w.user.id, 1, false]);
  assert.equal((await call('/admin/stats', { token: admin }, 'GET')).body.totals.team_unread, 1);
  const thread = (await call(`/admin/users/${w.user.id}/messages`, { token: admin }, 'GET')).body;
  assert.deepEqual(thread.map((m) => [m.from_team, m.body]), [[true, 'Hi Tina, your profile looks great!'], [false, 'Thank you!']]);
  assert.equal((await call('/admin/messages', { token: admin }, 'GET')).body[0].unread, 0); // opened = read

  // The Team account: no reset email, no session, not in lists, counts or announcements.
  mails.length = 0;
  await call('/auth/forgot', { email: 'team@readytowork.ph' });
  assert.equal(mails.length, 0);
  const { rows: [t] } = await pool.query("SELECT id FROM users WHERE role = 'team'");
  const jwt = (await import('jsonwebtoken')).default;
  const forged = jwt.sign({ id: t.id, role: 'team' }, process.env.JWT_SECRET);
  assert.equal((await call('/me', { token: forged }, 'GET')).status, 401);
  assert.ok(!(await call('/admin/users?q=team', { token: admin }, 'GET')).body.users.some((u) => u.id === t.id));
  const { counts } = (await call('/admin/broadcasts', { token: admin }, 'GET')).body;
  assert.equal(counts.everyone, counts.employers + counts.workers);

  await pool.query('UPDATE users SET suspended_at = now() WHERE id = $1', [w.user.id]);
  assert.equal((await call(`/admin/users/${w.user.id}/message`, { token: admin, body: 'hello' })).status, 409);
  await pool.query('UPDATE users SET suspended_at = NULL WHERE id = $1', [w.user.id]);
});

test('sample jobs: posted at random planned times by many employers, never twice; open to applications, not in the sitemap; admin can log in as anyone', async () => {
  const { postDueSampleJobs, phDay, spread } = await import('../src/modules/sample-jobs/sample-jobs.service.js');
  // Planned times stay in the window, sorted and at least an hour apart.
  for (let k = 0; k < 200; k++) {
    const t = spread(10, 0, 17.5 * 3_600_000);
    assert.equal(t.length, 10);
    assert.ok(t[0] >= 0 && t.at(-1) <= 17.5 * 3_600_000 && t.every((x, i) => !i || x - t[i - 1] >= 3_600_000 - 1));
  }
  const { signAdminToken } = await import('../src/middleware/auth.js');
  const admin = signAdminToken();
  const day = phDay(Date.now());
  const at = (hhmm) => Date.parse(`${day}T${hhmm}:00+08:00`);
  const plan = async () => (await pool.query(`SELECT value FROM settings WHERE key = 'sample_jobs_plan'`)).rows[0].value;

  assert.equal(await postDueSampleJobs(pool, 0, at('12:00')), 0); // off
  assert.equal(await postDueSampleJobs(pool, 10, at('05:00')), 0); // plans 10 between 6am and 11:30pm, none due yet
  const { times } = await plan();
  assert.equal(times.length, 10);
  assert.ok(times.every((t) => t >= at('06:00') && t <= at('23:30')));
  const byNoon = times.filter((t) => t <= at('12:00')).length;
  assert.equal(await postDueSampleJobs(pool, 10, at('12:00')), byNoon);
  assert.equal(await postDueSampleJobs(pool, 10, at('12:00')), 0); // nothing posts twice
  assert.equal(await postDueSampleJobs(pool, 10, at('23:59')), 10 - byNoon);
  const { rows: jobs } = await pool.query('SELECT id, employer_id, created_at FROM jobs WHERE is_sample ORDER BY created_at');
  assert.deepEqual(jobs.map((j) => Math.round(j.created_at / 1000)), times.map((t) => Math.round(t / 1000))); // dated to the plan
  assert.ok(new Set(jobs.map((j) => j.employer_id)).size > 1);

  const w = (await call('/auth/register', { email: 'sample.w@x.ph', password: 'password1', name: 'Sam Worker', role: 'worker' })).body;
  assert.equal((await call(`/jobs/${jobs[0].id}/apply`, { token: w.token, cover_letter: 'Hi' })).status, 201); // like a real job
  // Nothing in the public job data says it's a sample, for visitors or workers.
  for (const token of [undefined, w.token]) {
    const pub = (await call(`/jobs/${jobs[0].id}`, { token }, 'GET')).body;
    assert.ok(!('is_sample' in pub) && pub.indexed === false && !/sample/i.test(JSON.stringify(pub)));
  }
  assert.equal((await pool.query('SELECT plan FROM users WHERE id = $1', [jobs[0].employer_id])).rows[0].plan, 'premium');
  assert.ok(!(await call('/jobs/sitemap')).body.some((j) => j.id === jobs[0].id));
  assert.equal((await call('/admin/sample-jobs', { token: admin })).body.total, 10);

  // Log in as: any worker or employer, admin only; looking around doesn't make them look active.
  const loginAs = (id, token) => fetch(`${base}/admin/users/${id}/login-as`, { method: 'POST', headers: token ? asCookie(token) : {} });
  assert.equal((await loginAs(jobs[0].employer_id)).status, 401);
  assert.equal((await loginAs(99999, admin)).status, 404);
  for (const id of [jobs[0].employer_id, w.user.id]) {
    const res = await loginAs(id, admin);
    assert.equal(res.status, 204);
    assert.match(res.headers.getSetCookie().join(), /Max-Age=7200/);
    assert.equal((await call('/me', { token: sessionFrom(res) })).body.id, id);
  }
  await new Promise((r) => setTimeout(r, 50)); // the activity write happens after the response
  assert.equal((await pool.query('SELECT last_seen_at FROM users WHERE id = $1', [jobs[0].employer_id])).rows[0].last_seen_at, null);
  // Reading their messages as them leaves them unread; their own visit marks them read.
  const asEmployer = sessionFrom(await loginAs(jobs[0].employer_id, admin));
  const asWorker = sessionFrom(await loginAs(w.user.id, admin));
  assert.equal((await call(`/messages/${w.user.id}`, { token: asEmployer, body: 'Hi Sam' })).status, 201);
  await call(`/messages/${jobs[0].employer_id}`, { token: asWorker }, 'GET');
  assert.equal((await call('/messages/unread-count', { token: w.token }, 'GET')).body.count, 1);
  await call(`/messages/${jobs[0].employer_id}`, { token: w.token }, 'GET');
  assert.equal((await call('/messages/unread-count', { token: w.token }, 'GET')).body.count, 0);
  // Not into suspended accounts.
  await call(`/admin/users/${w.user.id}/suspend`, { token: admin, suspended: true }, 'PUT');
  assert.equal((await loginAs(w.user.id, admin)).status, 409);
  await call(`/admin/users/${w.user.id}/suspend`, { token: admin, suspended: false }, 'PUT');

  // Removing them all keeps the one a real worker applied to (closed), so their application stays.
  assert.deepEqual((await call('/admin/sample-jobs', { token: admin }, 'DELETE')).body, { deleted: 9, closed: 1 });
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM applications WHERE job_id = $1', [jobs[0].id])).rows[0].n, 1);
  await pool.query('DELETE FROM jobs WHERE is_sample');

  // Fill the board: 40 at once, dated in the past, at least 30 minutes apart, no role used twice.
  assert.equal((await call('/admin/sample-jobs', { token: admin, count: 101 })).status, 400);
  assert.equal((await call('/admin/sample-jobs', { token: admin, count: 40 })).status, 201);
  const { rows: filled } = await pool.query('SELECT title, created_at FROM jobs WHERE is_sample ORDER BY created_at');
  assert.equal(filled.length, 40);
  assert.ok(filled.every((j, i) => j.created_at < new Date() && (!i || j.created_at - filled[i - 1].created_at >= 30 * 60_000 - 1000)));
  const { ROLES, FILL_ROLES } = await import('../src/modules/sample-jobs/sample-roles.js');
  const roleOf = (t, list) => list.map(([r]) => r).filter((r) => t.includes(r)).sort((a, b) => b.length - a.length)[0];
  assert.equal(new Set(filled.map((j) => roleOf(j.title, FILL_ROLES))).size, 40); // 40 different fill roles
  assert.ok(!FILL_ROLES.some(([r]) => ROLES.some(([d]) => d === r))); // none of them in the daily list

  // Off in the morning, back on in the evening: nothing planned while it was off gets posted.
  const day2 = phDay(Date.now() + 86_400_000);
  const at2 = (hhmm) => Date.parse(`${day2}T${hhmm}:00+08:00`);
  assert.equal(await postDueSampleJobs(pool, 10, at2('05:00')), 0);
  assert.equal(await postDueSampleJobs(pool, 0, at2('09:00')), 0);
  assert.deepEqual((await plan()).times, []);
  assert.equal(await postDueSampleJobs(pool, 10, at2('20:00')), 0);
  assert.ok((await plan()).times.every((t) => t > at2('20:00')));
  await pool.query(`DELETE FROM users WHERE email LIKE '%@seed.test'`);
  await pool.query(`DELETE FROM settings WHERE key = 'sample_jobs_plan'`);
});
