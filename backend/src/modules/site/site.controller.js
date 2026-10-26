// Public numbers and settings the website shows to everyone.
import * as Site from './site.model.js';
import { getSettings } from '../../services/settings.js';

export const stats = async (req, res) => {
  res.json(await Site.stats());
};

// Public: only what the site needs to render.
export const publicSettings = async (req, res) => {
  const { topups_enabled, max_job_applications, notice, homepage_design, homepage_photo } = await getSettings();
  const live = notice && (!notice.ends_at || Date.parse(notice.ends_at) > Date.now());
  res.json({ topups_enabled, max_job_applications, notice: live ? { text: notice.text.trim(), tone: notice.tone } : null, homepage_design, homepage_photo });
};
