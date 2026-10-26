// Hire Talent (search and profiles), saved workers, hires, and the worker's own profile.
import { PAGE_SIZE, TYPES } from '../../config.js';
import { pageOf } from '../../lib/paging.js';
import { bad, num, skillList, str } from '../../lib/validate.js';
import { hooks } from '../../services/hooks.js';
import { isOwn } from '../jobs/jobs.model.js';
import * as Workers from './workers.model.js';
import { bentoFields, profileLink, revealFor, workerViews } from './workers.service.js';

export const list = async (req, res) => {
  const { workers, total } = await Workers.search(req.user.id, req.query, pageOf(req));
  const view = await workerViews(req.user.id, workers.map((w) => w.id));
  res.json({ workers: workers.map(view), total, page_size: PAGE_SIZE });
};

export const get = async (req, res) => {
  if (req.user.role !== 'employer' && req.user.id !== num(req.params.id)) return res.status(403).json({ error: 'Only employers can view worker profiles' });
  const w = await Workers.findProfile(num(req.params.id));
  if (!w) return res.status(404).json({ error: 'Worker not found' });
  if (req.user.id === w.id) return res.json(w);
  const rel = await Workers.relationTo(req.user.id, w.id);
  res.json({ ...(await workerViews(req.user.id, [w.id]))(w), ...rel });
};

export const save = async (req, res) => {
  const id = num(req.params.workerId);
  if (!(await Workers.isWorker(id))) return res.status(404).json({ error: 'Worker not found' });
  await Workers.save(req.user.id, id);
  res.status(204).end();
};

export const unsave = async (req, res) => {
  await Workers.unsave(req.user.id, num(req.params.workerId));
  res.status(204).end();
};

// Saved workers, most recently saved first (same privacy rules as search).
export const saved = async (req, res) => {
  const rows = await Workers.listSaved(req.user.id);
  res.json(rows.map(await workerViews(req.user.id, rows.map((w) => w.id))));
};

// Mark as hired: only for someone the employer can already talk to here (applied, chatting, or a paid plan).
export const hire = async (req, res) => {
  const id = num(req.params.workerId);
  if (!(await Workers.isWorker(id))) return res.status(404).json({ error: 'Worker not found' });
  if (!(await revealFor(req.user.id, [id]))(id))
    return res.status(403).json({ error: 'You can mark someone as hired once they’ve applied to your job or you’ve talked with them.' });
  let jobId = req.body?.job_id == null ? null : num(req.body.job_id);
  if (jobId !== null && !(await isOwn(jobId, req.user.id))) jobId = null;
  await Workers.hire(req.user.id, id, jobId);
  res.status(204).end();
};

export const unhire = async (req, res) => {
  await Workers.unhire(req.user.id, num(req.params.workerId));
  res.status(204).end();
};

export const hires = async (req, res) => {
  res.json(await Workers.listHires(req.user.id));
};

export const updateProfile = async (req, res) => {
  const availability = req.body.availability;
  if (!TYPES.includes(availability)) return bad(res, 'Invalid availability');
  const portfolio = profileLink(req.body.portfolio_url);
  const linkedin = profileLink(req.body.linkedin_url, 'linkedin.com');
  if (portfolio === undefined) return bad(res, 'Portfolio link must be a web address, like https://yoursite.com');
  if (linkedin === undefined) return bad(res, 'LinkedIn link must be a linkedin.com address');
  const extra = bentoFields(req.body);
  if (typeof extra === 'string') return bad(res, extra);
  const skills = skillList(req.body.skills).slice(0, 10);
  // years only for skills still on the list
  if (extra.skill_years) extra.skill_years = JSON.stringify(Object.fromEntries(Object.entries(extra.skill_years).filter(([k]) => skills.includes(k))));
  res.json(await Workers.updateProfile(req.user.id, {
    title: str(req.body.title, 200), bio: str(req.body.bio), skills, hourly_rate: num(req.body.hourly_rate), availability,
    portfolio_url: portfolio, linkedin_url: linkedin,
  }, extra));
};

// A worker's CV, from their profile (when they chose to show it). It usually has their contact details,
// so an employer gets it only once they may contact the worker anyway (see revealFor).
export const resume = async (req, res) => {
  const id = num(req.params.id);
  if (req.user.role !== 'employer' && req.user.id !== id) return res.status(403).json({ error: 'Only employers can view worker profiles' });
  const p = await Workers.findResume(id);
  if (!p?.resume_key || !p.show_resume) return res.status(404).json({ error: 'This worker hasn’t shared a resume' });
  if (req.user.id !== id && !(await revealFor(req.user.id, [id]))(id))
    return res.status(403).json({ error: 'Upgrade to Pro to download resumes', code: 'upgrade' });
  res.json({ name: p.resume_name, url: await hooks.storage.signedUrl(p.resume_key, p.resume_name) });
};
