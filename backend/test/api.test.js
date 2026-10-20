import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

process.env.DATABASE_URL = 'postgres://localhost:5432/remotepinas_test';
delete process.env.TURNSTILE_SECRET; // tests that need the robot check switch it on themselves
const { pool } = await import('../src/db.js');
const { app } = await import('../src/app.js');

await pool.query('DROP TABLE IF EXISTS blocked_emails, email_verifications, hires, saved_workers, feedback, ai_analyses, password_resets, settings, messages, applications, jobs, worker_profiles, users');
// Never send real email from tests, even if .env has a Resend key; tests read `sent` instead.
const sent = [];
// Email-confirmation messages go to every new email sign-up; most tests don't care, so they're left out.
const capture = async (e) => { if (!/^Confirm your email/.test(e.subject)) sent.push(e); };
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
await pool.query(await readFile(new URL('../src/schema.sql', import.meta.url), 'utf8'));
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
  app.locals.sendEmail = async (e) => { if (!/^(Welcome|Confirm your email)/.test(e.subject)) emails.push(e); };
  const reg = async (email, role, name) => (await call('/auth/register', { email, password: 'password1', name, role })).body;
  const boss = await reg('hr@acme.ph', 'employer', 'Acme HR');
  const rival = await reg('hr@rival.ph', 'employer', 'Rival');
  const maria = await reg('maria@x.ph', 'worker', 'Maria');
  const job = (await call('/jobs', { token: boss.token, title: 'Bookkeeper', description: 'x', job_type: 'gig' })).body;
  const rivalJob = (await call('/jobs', { token: rival.token, title: 'Other', description: 'x', job_type: 'gig' })).body;
  await pool.query("UPDATE users SET plan = 'pro' WHERE id = $1", [boss.user.id]); // paid: may reach out first
  const send = (from, to, body, job_id) => call(`/messages/${to.user.id}`, { token: from.token, body, ...(job_id && { job_id }) });
  const thread = (me, other) => call(`/messages/${other.user.id}`, { token: me.token }, 'GET');

  assert.equal((await send(maria, boss, 'Hi, hire me')).status, 403); // workers can't cold-message
  assert.equal((await send(boss, rival, 'hey')).status, 404); // employer -> employer
  assert.equal((await send(boss, boss, 'me')).status, 404);
  assert.equal((await send(boss, maria, '   ')).status, 400);
  assert.equal((await send(boss, maria, 'x', rivalJob.id)).status, 400); // someone else's job

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
  assert.deepEqual([t.user.name, t.can_send, t.messages.length, t.messages[0].job_title], ['Acme HR', true, 2, 'Bookkeeper']);
  assert.equal((await call('/messages/unread-count', { token: maria.token }, 'GET')).body.count, 0);

  assert.equal((await send(maria, boss, 'Yes, tomorrow works', job.id)).status, 201); // reply now allowed
  assert.equal(emails.length, 2);
  assert.equal(emails[1].to, 'hr@acme.ph');
  await send(boss, maria, 'Great, 10am'); // Maria read everything, so she gets a new email
  assert.equal(emails.length, 3);
  assert.equal((await thread(boss, maria)).body.messages.length, 4);
  assert.equal((await thread(rival, maria)).body.messages.length, 0); // other employers see nothing
  assert.equal((await thread(maria, rival)).body.can_send, false);
});

test('welcome email on sign-up, tailored by role', async () => {
  sent.length = 0;
  app.locals.sendEmail = capture;
  await call('/auth/register', { email: 'new.worker@x.ph', password: 'password1', name: 'Rosa', role: 'worker' });
  await call('/auth/register', { email: 'new.boss@co.com', password: 'password1', name: 'Bright Co', role: 'employer' });
  await call('/auth/register', { email: 'new.boss@co.com', password: 'password1', name: 'Dup', role: 'employer' }); // 409: no email
  await call('/auth/login', { email: 'new.worker@x.ph', password: 'password1' }); // login: no email
  assert.deepEqual(sent.map((e) => e.to), ['new.worker@x.ph', 'new.boss@co.com']);
  assert.match(sent[0].subject, /get you hired/);
  assert.match(sent[0].text, /Hi Rosa,[\s\S]*60 free Credits[\s\S]*\/profile/);
  assert.match(sent[1].subject, /start hiring/);
  assert.match(sent[1].text, /Hi Bright Co,[\s\S]*\/jobs\/new/);
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

test('analyzer: 10 free analyses, cached results free, premium unlimited, owner only', async () => {
  const calls = [];
  app.locals.analyzeApplication = async ({ job, applicant }) => {
    calls.push({ job, applicant });
    return { score: 150, verdict: 'Solid fit', strengths: ['A', 'B', 'C', 'D', 'E'], concerns: [] }; // out-of-range score gets clamped
  };
  const reg = async (email, role) => (await call('/auth/register', { email, password: 'password1', name: email, role })).body.token;
  const boss = await reg('ai.boss@co.com', 'employer');
  const other = await reg('ai.other@co.com', 'employer');
  const job = (await call('/jobs', { token: boss, title: 'Data Entry', description: 'Excel work', skills: 'excel', job_type: 'gig' })).body;
  const appIds = [];
  for (let i = 0; i < 11; i++) {
    const w = await reg(`ai.w${i}@x.ph`, 'worker');
    appIds.push((await call(`/jobs/${job.id}/apply`, { token: w, cover_letter: `Letter ${i}` })).body.id);
  }
  const analyze = (token, id) => call(`/applications/${id}/analyze`, { token }, 'POST');

  assert.deepEqual((await call('/analyzer/usage', { token: boss }, 'GET')).body, { plan: 'free', used: 0, limit: 10, remaining: 10 });
  assert.equal((await analyze(other, appIds[0])).status, 404); // not their job
  const first = await analyze(boss, appIds[0]);
  assert.equal(first.status, 200);
  assert.equal(first.body.analysis.score, 100);
  assert.equal(first.body.analysis.strengths.length, 4);
  assert.equal(calls[0].job.title, 'Data Entry');
  assert.equal(calls[0].applicant.cover_letter, 'Letter 0');

  assert.equal((await analyze(boss, appIds[0])).body.usage.remaining, 9); // cached: no extra call, no extra use
  assert.equal(calls.length, 1);
  for (const id of appIds.slice(1, 10)) assert.equal((await analyze(boss, id)).status, 200);
  const blocked = await analyze(boss, appIds[10]);
  assert.equal(blocked.status, 402);
  assert.equal(blocked.body.upgrade, true);
  assert.equal(calls.length, 10); // the 11th never reached the AI
  assert.equal((await analyze(boss, appIds[3])).status, 200); // re-opening an analyzed one still works

  const list = (await call(`/jobs/${job.id}/applications`, { token: boss }, 'GET')).body.applicants;
  assert.equal(list.filter((a) => a.analysis).length, 10);

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
  const reg = async (email, role) => (await call('/auth/register', { email, password: 'password1', name: email, role })).body.token;
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
  const reg = async (email, role) => (await call('/auth/register', { email, password: 'password1', name: email, role })).body.token;
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

test('analyzer reads resume text extracted at upload, and says when it could not', async () => {
  const seen = [];
  app.locals.analyzeApplication = async ({ applicant }) => { seen.push(applicant.resume_text); return { score: 80, verdict: 'ok', strengths: [], concerns: [] }; };
  const reg = async (email, role) => (await call('/auth/register', { email, password: 'password1', name: email, role })).body.token;
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
  assert.deepEqual((await call('/admin/settings', { token }, 'GET')).body, { topups_enabled: false, daily_applications: 60, free_ai_analyses: 10 });

  assert.equal((await call('/admin/settings', { token, topups_enabled: 'yes' }, 'PUT')).status, 400);
  assert.equal((await call('/admin/settings', { token, made_up: 1 }, 'PUT')).status, 400);
  const saved = await call('/admin/settings', { token, topups_enabled: true, free_ai_analyses: 3 }, 'PUT');
  assert.deepEqual(saved.body, { topups_enabled: true, daily_applications: 60, free_ai_analyses: 3 });
  assert.equal((await call('/settings', {}, 'GET')).body.topups_enabled, true);
  const boss = (await call('/auth/register', { email: 'adm.b@co.com', password: 'password1', name: 'B', role: 'employer' })).body.token;
  assert.equal((await call('/analyzer/usage', { token: boss }, 'GET')).body.limit, 3); // setting is used live
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
  const { signAdminToken } = await import('../src/auth.js');
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

  // Everyone can apply; Free sees the top 20 (most Credits first), the rest wait behind an upgrade.
  const { rows: workers } = await pool.query(
    "INSERT INTO users (email, name, role) SELECT 'lw' || i || '@x.ph', 'Worker ' || i, 'worker' FROM generate_series(1, 25) i RETURNING id");
  for (const [i, w] of workers.entries())
    await pool.query("INSERT INTO applications (job_id, worker_id, cover_letter, credits) VALUES ($1, $2, 'hi', $3)", [jobs[1], w.id, i === 24 ? 50 : 1]);
  const list = (await call(`/jobs/${jobs[1]}/applications`, { token: boss.token }, 'GET')).body;
  assert.deepEqual([list.applicants.length, list.total, list.limit, list.plan], [20, 25, 20, 'free']);
  assert.equal(list.applicants[0].name, 'Worker 25'); // highest bid is seen first, even though it came last
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
  const { rows: [first] } = await pool.query('SELECT id FROM applications WHERE job_id = $1 ORDER BY credits DESC LIMIT 1', [jobs[1]]);
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
  const { PREMIUM_FAIR_USE } = await import('../src/app.js');
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

  const { signAdminToken } = await import('../src/auth.js');
  const adminToken = signAdminToken();
  const list = (await call('/admin/feedback', { token: adminToken }, 'GET')).body;
  assert.deepEqual(list.map((f) => [f.type, f.email]), [['idea', 'guest@mail.ph'], ['bug', 'fb.user@co.com']]);
  assert.equal((await call(`/admin/feedback/${list[1].id}`, { token: adminToken, done: true }, 'PUT')).status, 204);
  assert.ok((await call('/admin/feedback', { token: adminToken }, 'GET')).body.at(-1).done_at);
  assert.equal((await call('/admin/feedback', { token: user.body.token }, 'GET')).status, 401);
});

test('admin: users, jobs and subscriptions pages; close a job; admin only', async () => {
  const { signAdminToken } = await import('../src/auth.js');
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
  const { HIDDEN } = await import('../src/app.js');
  assert.equal(w.bio, `QuickBooks pro using Node.js. Portfolio: ${HIDDEN}, email ${HIDDEN}, call ${HIDDEN} or ${HIDDEN}`); // Node.js stays
  const { hideContacts } = await import('../src/app.js');
  assert.equal(hideContacts('email me at @juan.cruz@gmail.com'), `email me at @${HIDDEN}`); // one email, not a handle plus a site
  assert.equal((await call('/workers?q=QuickBooks', { token: boss.token }, 'GET')).body.workers.find((x) => x.id === maria.user.id).name, 'Maria S.');
  assert.equal((await call(`/workers/${maria.user.id}`, { token: maria.token }, 'GET')).body.name, 'Maria Clara Santos'); // her own profile

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
  const { HIDDEN } = await import('../src/app.js');
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

test('email confirmation: link on sign-up, needed to post jobs, resend, Google and reset confirm, confirmed accounts keep their password on Google link', async () => {
  const mails = [];
  app.locals.sendEmail = async (e) => { if (/^Confirm your email/.test(e.subject)) mails.push(e); };
  const reg = (email, role) => call('/auth/register', { email, password: 'password1', name: 'Conf', role, unconfirmed: true });
  const linkOf = (m) => m.text.match(/verify-email\?token=([\w-]+)/)[1];
  const verify = (token) => fetch(`${base}/auth/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });

  const boss = await reg('conf.boss@co.com', 'employer');
  assert.equal(boss.body.user.email_verified, false);
  assert.deepEqual(mails.map((m) => m.to), ['conf.boss@co.com']);
  const job = { token: boss.body.token, title: 'VA', description: 'x', job_type: 'gig' };
  assert.equal((await call('/jobs', job)).body.code, 'verify_email'); // unconfirmed employers can't post yet

  const resend = await call('/auth/verify/resend', { token: boss.body.token }, 'POST');
  assert.equal(resend.body.verified, false);
  assert.equal(mails.length, 2);
  assert.equal((await verify(linkOf(mails[0]))).status, 400); // asking again replaced the first link
  assert.equal((await verify(linkOf(mails[1]))).status, 200);
  assert.equal((await verify(linkOf(mails[1]))).status, 400); // one use only
  assert.equal((await call('/me', { token: boss.body.token }, 'GET')).body.email_verified, true);
  assert.equal((await call('/jobs', job)).status, 201);
  assert.equal((await call('/auth/verify/resend', { token: boss.body.token }, 'POST')).body.verified, true);
  assert.equal(mails.length, 2); // nothing to resend once confirmed

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
  const { MEMBERS_ONLY } = await import('../src/app.js');
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
  const { signAdminToken } = await import('../src/auth.js');
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
