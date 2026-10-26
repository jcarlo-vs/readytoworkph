// Admin › Settings.
import * as Settings from '../../models/settings.model.js';
import { bad } from '../../lib/validate.js';
import { SETTINGS, getSettings } from '../../services/settings.js';

export const get = async (req, res) => res.json(await getSettings());

export const update = async (req, res) => {
  const changes = Object.entries(req.body ?? {});
  for (const [k, v] of changes) {
    if (!SETTINGS[k]) return bad(res, `Unknown setting: ${k}`);
    if (!SETTINGS[k].valid(v)) return bad(res, `Invalid value for ${k}`);
  }
  for (const [k, v] of changes) {
    await Settings.save(k, v);
  }
  res.json(await getSettings());
};
