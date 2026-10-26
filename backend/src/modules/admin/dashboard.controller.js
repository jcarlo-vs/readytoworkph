// Admin dashboard numbers.
import { dashboard } from './admin.model.js';

export const stats = async (req, res) => {
  res.json(await dashboard());
};
