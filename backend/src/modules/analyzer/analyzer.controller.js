// Smart Score: the AI's fit score for one application.
import { PLAN_LIMITS } from '../../config.js';
import { pool } from '../../db/index.js';
import { num, str } from '../../lib/validate.js';
import { hooks } from '../../services/hooks.js';
import { lockUser } from '../../models/users.model.js';
import { hiddenApplicant, planOf } from '../../services/plans.js';
import * as Analyzer from './analyzer.model.js';
import { analyzerUsage, outOfAnalyses } from './analyzer.service.js';

export const usage = async (req, res) => {
  res.json(await analyzerUsage(pool, req.user.id));
};

// Scores one application against its job. Saved results are returned again for free; `again: true`
// asks the AI for a fresh look (e.g. after the job or the applicant's resume changed) and uses one more.
// 300 an hour leaves room for Premium's "score all applicants"; quotas are checked below.
export const analyze = async (req, res) => {
  const plan = await planOf(pool, req.user.id);
  const row = await Analyzer.findForScoring(num(req.params.id), req.user.id);
  if (!row) return res.status(404).json({ error: 'Application not found' });
  if (PLAN_LIMITS[plan].applicants !== null && row.rank >= PLAN_LIMITS[plan].applicants) return hiddenApplicant(res, plan);
  const again = req.body?.again === true;
  if (row.analysis && !again) return res.json({ analysis: row.analysis, usage: await analyzerUsage(pool, req.user.id) });

  const before = await analyzerUsage(pool, req.user.id);
  if (before.remaining === 0) return outOfAnalyses(res, before);

  let analysis;
  try {
    const raw = await hooks.analyzeApplication({
      job: { title: row.title, description: row.description, skills: row.job_skills, job_type: row.job_type },
      applicant: { title: row.worker_title, bio: row.bio, skills: row.worker_skills, hourly_rate: row.hourly_rate, availability: row.availability, cover_letter: row.cover_letter, resume_text: row.resume_text },
    });
    const list = (v) => (Array.isArray(v) ? v.map((x) => str(x, 200)).filter(Boolean).slice(0, 4) : []);
    analysis = {
      score: Math.max(0, Math.min(100, Math.round(Number(raw.score) || 0))),
      verdict: str(raw.verdict, 300),
      strengths: list(raw.strengths),
      concerns: list(raw.concerns),
      // so the employer knows when a scanned (image-only) resume couldn't be included
      resume: row.resume_text === null ? 'none' : row.resume_text ? 'read' : 'unreadable',
    };
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: 'The analyzer is unavailable right now. Please try again.' });
  }

  // Re-check the quota under a lock so parallel clicks can't go past the free limit.
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await lockUser(req.user.id, db);
    const usage = await analyzerUsage(db, req.user.id);
    if (usage.remaining === 0) {
      await db.query('ROLLBACK');
      return outOfAnalyses(res, usage);
    }
    // A first analysis only saves if no parallel click saved one already (that one wins, and only it counts).
    const saved = await Analyzer.saveScore(row.id, analysis, again, db);
    if (saved) await Analyzer.countRun(req.user.id, row.id, db);
    const result = saved ?? await Analyzer.findScore(row.id, db);
    await db.query('COMMIT');
    res.json({ analysis: result, usage: await analyzerUsage(pool, req.user.id) });
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
};
