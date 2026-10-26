// Site settings the admin changes in Admin › Settings (stored in the settings table).
import * as Settings from '../models/settings.model.js';

// Site settings the admin can change at /admin, stored in the settings table (defaults apply until changed).
export const SETTINGS = {
  topups_enabled: { default: false, valid: (v) => typeof v === 'boolean' },
  daily_applications: { default: 60, valid: (v) => Number.isInteger(v) && v >= 1 && v <= 500 }, // spam cap; 0-credit applies are free
  free_ai_analyses: { default: 5, valid: (v) => Number.isInteger(v) && v >= 0 && v <= 1000 },
  free_full_names: { default: false, valid: (v) => typeof v === 'boolean' }, // Free employers see "Maria Santos", not "Maria S."
  max_job_applications: { default: 250, valid: (v) => Number.isInteger(v) && v >= 10 && v <= 5000 }, // a job closes itself when full
  homepage_design: { default: 'classic', valid: (v) => ['classic', 'hello_call', 'big_photo', 'search_first', 'two_faces'].includes(v) }, // which homepage hero visitors see
  sample_jobs_per_day: { default: 0, valid: (v) => Number.isInteger(v) && v >= 0 && v <= 50 }, // the sample-job autopilot; 0 = off
  homepage_photo: { default: 'laughing', valid: (v) => ['laughing', 'good_news'].includes(v) }, // the Hello Call / Big Photo hero photo
  // The site-wide notice bar ("Maintenance tonight 10pm"): plain text, a colour, and an optional end time; null = off.
  notice: { default: null, valid: (v) => v === null || (typeof v === 'object' && !Array.isArray(v)
    && typeof v.text === 'string' && v.text.trim().length >= 3 && v.text.length <= 200 && ['info', 'warning'].includes(v.tone)
    && (v.ends_at == null || !Number.isNaN(Date.parse(v.ends_at))) && Object.keys(v).every((k) => ['text', 'tone', 'ends_at'].includes(k))) },
};

export async function getSettings() {
  const rows = await Settings.readAll();
  const saved = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(Object.entries(SETTINGS).map(([k, s]) => [k, k in saved ? saved[k] : s.default]));
}
