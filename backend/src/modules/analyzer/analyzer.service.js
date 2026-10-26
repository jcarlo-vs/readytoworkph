// Smart Score allowance per plan and month.
import { PLAN_LIMITS, PREMIUM_FAIR_USE } from '../../config.js';
import { getSettings } from '../../services/settings.js';
import { usageThisMonth } from './analyzer.model.js';

// AI runs this calendar month (Philippine time), re-analyses included; they reset on the 1st.
export async function analyzerUsage(db, employerId) {
  const { plan, used } = await usageThisMonth(employerId, db);
  const limit = plan === 'free' ? (await getSettings()).free_ai_analyses : PLAN_LIMITS[plan].analyses;
  if (limit === null) return { plan, used, limit, remaining: used >= PREMIUM_FAIR_USE ? 0 : null };
  return { plan, used, limit, remaining: Math.max(0, limit - used) };
}

export const outOfAnalyses = (res, usage) => res.status(402).json(usage.limit === null
  ? { error: `You've reached this month's fair-use limit of ${PREMIUM_FAIR_USE.toLocaleString('en-US')} Smart Scores. It resets on the 1st; email support@readytowork.ph if you need more sooner.`, usage }
  : { error: `You've used this month's ${usage.limit} Smart Scores on the ${PLAN_LIMITS[usage.plan].name} plan. They reset on the 1st.`, upgrade: true, usage });
