// Plain formatting helpers, usable from both server pages and client components.
import type { Job, SalaryPeriod } from './api';

const PERIOD_SUFFIX: Record<SalaryPeriod, string> = { hour: '/hr', month: '/mo', year: '/yr', fixed: ' fixed' };
// "$7.50", "$1,200" (cents only when there are any)
const usd = (v: number | string) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: Number(v) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

export const salary = (j: Pick<Job, 'salary_min' | 'salary_max'> & { salary_period?: SalaryPeriod }) => {
  const per = PERIOD_SUFFIX[j.salary_period ?? 'month'];
  const [min, max] = [Number(j.salary_min) || 0, Number(j.salary_max) || 0];
  return min && max ? (min === max ? `${usd(min)}${per}` : `${usd(min)} to ${usd(max)}${per}`)
    : min ? `From ${usd(min)}${per}`
    : max ? `Up to ${usd(max)}${per}` : 'Salary negotiable';
};
