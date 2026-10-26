// Smart Matching: the AI recruiting agent for one job (see services/ai/matchAgent.js).
import { PLAN_LIMITS } from '../../config.js';
import { pool } from '../../db/index.js';
import { num } from '../../lib/validate.js';
import { runMatchAgent } from '../../services/ai/matchAgent.js';
import { lockUser } from '../../models/users.model.js';
import { hooks } from '../../services/hooks.js';
import * as Matches from './matches.model.js';
import { MAX_LIVE_RUNS, matchRunView, matchTools, matchUsage, payText } from './matches.service.js';

let liveRuns = 0; // runs streaming on this server right now (see MAX_LIVE_RUNS)

// A job's latest finished run (or ?run=<id>), its past runs, and this month's allowance.
export const latest = async (req, res) => {
  const job = await Matches.findJob(req.user.id, num(req.params.id));
  if (!job) return res.status(404).json({ error: 'Job not found' });
  await Matches.stopStaleRuns();
  const runs = await Matches.listRuns(job.id);
  const pick = req.query.run ? runs.find((r) => r.id === num(req.query.run)) : runs.find((r) => r.status === 'done');
  const run = pick && await Matches.findRun(pick.id);
  res.json({ runs, run: await matchRunView(req.user.id, run, job), budget: payText(job), usage: await matchUsage(pool, req.user.id) });
};

// Starts a run and streams what the agent does (Server-Sent Events); every step is saved as it happens.
export const run = async (req, res) => {
  const job = await Matches.findJob(req.user.id, num(req.params.id));
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (liveRuns >= MAX_LIVE_RUNS) return res.status(503).json({ error: 'Smart Matching is busy right now. Please try again in a minute.' });
  await Matches.stopStaleRuns();

  // Check the allowance and that no other run is going, under a lock so two clicks can't both start one.
  const db = await pool.connect();
  let run;
  try {
    await db.query('BEGIN');
    await lockUser(req.user.id, db);
    const usage = await matchUsage(db, req.user.id);
    const refuse = (status, body) => db.query('ROLLBACK').then(() => res.status(status).json(body));
    if (usage.remaining === 0) {
      return await refuse(402, usage.limit === 0
        ? { error: 'Smart Matching is part of the Pro and Premium plans.', upgrade: true, usage }
        : { error: `You've used this month's ${usage.limit} Smart Matching searches on the ${PLAN_LIMITS[usage.plan].name} plan. They reset on the 1st.`, upgrade: usage.plan !== 'premium', usage });
    }
    if (await Matches.hasRunning(req.user.id, db))
      return await refuse(409, { error: 'A match search is already running. It takes about a minute.' });
    run = await Matches.createRun(job.id, req.user.id, db);
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    db.release();
  }

  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' });
  const send = (event) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`); };
  send({ type: 'start', run_id: run.id });
  const steps = [];
  // Step saves run one after another and finish before the final save, so a late one can't overwrite it.
  let saving = Promise.resolve();
  liveRuns++;
  try {
    const result = await runMatchAgent({
      job: { ...job, pay: payText(job) },
      tools: matchTools(req.user.id),
      model: hooks.matchModel,
      onStep: (step) => {
        const saved = { ...step, at: new Date().toISOString() };
        steps.push(saved);
        send(saved);
        const snapshot = [...steps];
        saving = saving.then(() => Matches.saveSteps(run.id, snapshot)).catch((err) => console.error(err));
      },
    });
    await saving;
    const done = await Matches.finishRun(run.id, steps, result);
    send({ type: 'result', run: await matchRunView(req.user.id, done, job), budget: payText(job), usage: await matchUsage(pool, req.user.id) });
  } catch (err) {
    console.error(err);
    await saving;
    await Matches.failRun(run.id, steps, 'Smart Matching ran into a problem').catch((e) => console.error(e));
    send({ type: 'error', error: 'Smart Matching ran into a problem, and this search wasn’t counted. Please try again.' });
  } finally {
    liveRuns--;
    res.end();
  }
};
