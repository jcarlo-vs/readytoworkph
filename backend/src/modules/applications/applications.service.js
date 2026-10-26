// Workers' daily Credits.
import { DAILY_CREDITS } from '../../config.js';
import { usedToday } from './applications.model.js';

export async function creditsToday(db, workerId) {
  const { used, applications, resets_at } = await usedToday(workerId, db);
  return { daily: DAILY_CREDITS, used, remaining: DAILY_CREDITS - used, applications, resets_at };
}
