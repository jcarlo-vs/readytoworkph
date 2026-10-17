import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

process.env.DATABASE_URL = 'postgres://localhost:5432/remotepinas_test';
const { pool } = await import('../src/db.js');
const { app } = await import('../src/app.js');

await pool.query('DROP TABLE IF EXISTS settings, messages, applications, jobs, worker_profiles, users');
// Never send real email from tests, even if .env has a Resend key; tests read `sent` instead.
const sent = [];
app.locals.sendEmail = async (e) => { sent.push(e); };
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

async function call(path, { token, ...body } = {}, method = Object.keys(body).length ? 'POST' : 'GET') {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
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
  assert.equal(apps.body[0].name, 'Juan');

  const profile = { token: wrk.body.token, title: 'VA', bio: 'Admin pro', skills: ['Excel'], hourly_rate: '5', availability: 'part-time' };
  const badLink = async (extra) => (await call('/profile', { ...profile, ...extra }, 'PUT')).status;
  assert.equal(await badLink({ portfolio_url: 'javascript:alert(1)' }), 400);
  assert.equal(await badLink({ portfolio_url: 'not a link' }), 400);
  assert.equal(await badLink({ linkedin_url: 'https://evil.com/linkedin.com' }), 400);
  assert.equal(await badLink({ linkedin_url: 'https://notlinkedin.com/in/juan' }), 400);
  const prof = await call('/profile', { ...profile, portfolio_url: 'juan.dev/work', linkedin_url: 'www.linkedin.com/in/juan' }, 'PUT');
  assert.deepEqual([prof.body.portfolio_url, prof.body.linkedin_url], ['https://juan.dev/work', 'https://www.linkedin.com/in/juan']);
  assert.equal(prof.status, 200);
  assert.equal((await call('/workers?skill=excel', { token: emp.body.token }, 'GET')).body[0].name, 'Juan');
  assert.equal((await call('/workers?skill=excel')).status, 401); // talent isn't public
  assert.equal((await call('/workers?skill=excel', { token: wrk.body.token }, 'GET')).status, 403); // workers can't browse other workers
  const juanId = (await call('/me', { token: wrk.body.token }, 'GET')).body.id;
  assert.equal((await call(`/workers/${juanId}`, { token: wrk.body.token }, 'GET')).status, 200); // own profile
  assert.equal((await call(`/workers/${juanId}`, { token: emp.body.token }, 'GET')).status, 200);
  assert.equal((await call(`/workers/${juanId}`)).status, 401);
  assert.deepEqual((await call('/stats')).body, { jobs: 1, workers: 1, employers: 1, upgraded_this_month: 0 });

  const other = await call('/auth/register', { email: 'other@co.com', password: 'password1', name: 'Other', role: 'employer' });
  assert.equal((await call(`/jobs/${job.body.id}/applications`, { token: other.body.token }, 'GET')).body.length, 0);
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

  const applicants = (await call(`/jobs/${j1}/applications`, { token: boss }, 'GET')).body;
  const mine = (await call('/my/jobs', { token: boss }, 'GET')).body.find((j) => j.id === j1);
  assert.deepEqual([mine.applicant_count, mine.new_count, mine.analyzed_count, mine.top_applicants], [2, 2, 0, ['high', 'low']]);
  assert.deepEqual(applicants.map((a) => [a.name, a.credits]), [['high', 40], ['low', 1]]);
  assert.equal((await call('/credits', { token: boss }, 'GET')).status, 403);

  // Daily cap on applications, since 0-credit ones cost nothing.
  const spam = await reg('spam@x.ph', 'worker');
  for (let i = 0; i < 60; i++) {
    await pool.query("INSERT INTO applications (job_id, worker_id, cover_letter, credits) SELECT $1, id, 'x', 0 FROM users WHERE email = 'spam@x.ph'", [await newJob()]);
  }
  assert.equal((await apply(spam, j3, 0)).status, 429);
});

test('messages: who can write, read tracking, one email per unread batch', async () => {
  const emails = [];
  app.locals.sendEmail = async (e) => { if (!/^Welcome/.test(e.subject)) emails.push(e); };
  const reg = async (email, role, name) => (await call('/auth/register', { email, password: 'password1', name, role })).body;
  const boss = await reg('hr@acme.ph', 'employer', 'Acme HR');
  const rival = await reg('hr@rival.ph', 'employer', 'Rival');
  const maria = await reg('maria@x.ph', 'worker', 'Maria');
  const job = (await call('/jobs', { token: boss.token, title: 'Bookkeeper', description: 'x', job_type: 'gig' })).body;
  const rivalJob = (await call('/jobs', { token: rival.token, title: 'Other', description: 'x', job_type: 'gig' })).body;
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
  assert.match(emails[0].text, /Acme HR sent you a message on RemotePinas about "Bookkeeper"/);
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
  app.locals.sendEmail = async (e) => { sent.push(e); };
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

  const list = (await call(`/jobs/${job.id}/applications`, { token: boss }, 'GET')).body;
  assert.equal(list.filter((a) => a.analysis).length, 10);

  await pool.query("UPDATE users SET plan = 'pro' WHERE email = 'ai.boss@co.com'");
  assert.equal((await call('/analyzer/usage', { token: boss }, 'GET')).body.limit, 500); // pro: bigger allowance
  assert.equal((await call('/stats', {}, 'GET')).body.upgraded_this_month, 1); // plan change is stamped by the trigger
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
    fetch(`${base}/profile/resume`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': type, 'x-file-name': encodeURIComponent(name) }, body })
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
  const listed = async () => (await call(`/jobs/${job.id}/applications`, { token: boss }, 'GET')).body[0].resume_name;
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
  const put = (token, body) => fetch(`${base}/profile/resume`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/pdf' }, body });
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
    fetch(`${base}/profile/photo`, { method: 'PUT', headers: { authorization: `Bearer ${token.token}`, 'content-type': type }, body });
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
  assert.equal((await fetch(`${base}/profile/photo`, { method: 'DELETE', headers: { authorization: `Bearer ${token.token}` } })).status, 204);
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
    for (let i = 0; i < 10; i++) assert.equal((await call('/auth/login', { email: 'rl@x.ph', password: 'wrong' })).status, 401);
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
  app.locals.sendEmail = async (e) => { sent.push(e); };
  const ana = await google('good-new', 'worker');
  assert.deepEqual(sent.map((e) => e.to), ['ana@gmail.com']); // Google sign-up gets a welcome email too
  assert.equal(ana.status, 201);
  assert.deepEqual([ana.body.user.email, ana.body.user.name, ana.body.user.role], ['ana@gmail.com', 'Ana Cruz', 'worker']);
  assert.equal((await google('good-new')).body.user.id, ana.body.user.id); // returning user, no role needed
  assert.equal((await call('/auth/login', { email: 'ana@gmail.com', password: 'anything1' })).body.error, 'This account uses Google sign-in');

  const juan = await google('good-existing'); // password account with same email gets linked
  assert.equal(sent.length, 1); // returning/linked users: no welcome email
  assert.equal(juan.status, 200);
  assert.equal(juan.body.user.role, 'worker');
  assert.equal((await call('/auth/login', { email: 'juan@x.ph', password: 'password1' })).status, 200);
});
