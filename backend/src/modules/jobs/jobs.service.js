// Job posts: the form's rules, the monthly post limit, hiding contact details from visitors, the job-live email.
import { PERIODS, PLAN_LIMITS, SITE, TYPES } from '../../config.js';
import { MEMBERS_ONLY, hideContacts } from '../../lib/contacts.js';
import { num, skillList, str } from '../../lib/validate.js';
import { signedInUser } from '../../middleware/auth.js';
import { findContact } from '../../models/users.model.js';
import { hooks } from '../../services/hooks.js';
import { renderEmail } from '../../services/mail.js';

// "Your job is live" email to the employer after posting; sending happens in the background.
export async function jobLive(employerId, job) {
  const u = await findContact(employerId);
  await hooks.sendEmail({
    to: u.email,
    subject: `Your job is live: ${job.title}`,
    ...renderEmail({
      preheader: 'Filipino remote workers can now see your job and apply.',
      greeting: `Hi ${u.name},`,
      intro: [`Your job "${job.title}" is now live on ReadyToWork.ph. Workers can see it and apply.`],
      steps: [
        ['Check your applicants', 'New applicants show up on your job’s page. The Smart Score shows how well each one fits.'],
        ['Message the best fits', 'Ask questions, set up a call, and agree on pay directly.'],
        ['Edit or close anytime', 'Update the details, or close the job once you’ve hired.'],
      ],
      button: { label: 'See your job', url: `${SITE}/dashboard/jobs/${job.id}` },
      reason: 'You’re receiving this because you posted a job on ReadyToWork.ph.',
    }),
  });
}

// Sample jobs look like any other job: the flag never leaves the API, only whether search engines may list it.
export const plainJob = ({ is_sample, ...j }) => j;
export const forViewer = async (req, jobs) => {
  const plain = jobs.map((j) => ({ ...j, indexed: !j.is_sample })).map(plainJob);
  return (await signedInUser(req))?.verified ? plain // unconfirmed sign-ups see what visitors see
    : plain.map((j) => ({ ...j, title: hideContacts(j.title, MEMBERS_ONLY), description: hideContacts(j.description, MEMBERS_ONLY) }));
};

// Validates a job post (create or edit). Returns { error } or the cleaned fields in column order.
// Generous for any real job post, and keeps what the AI analyzer reads (and pays for) bounded.
// Too long is an error rather than a silent cut, so nobody loses the end of their post.
export const JOB_TITLE_MAX = 120;

export const JOB_DESCRIPTION_MAX = 10_000;

export function jobFields(body) {
  const tooLong = (v, max) => typeof v === 'string' && v.trim().length > max;
  if (tooLong(body.title, JOB_TITLE_MAX)) return { error: `Job title is too long (max ${JOB_TITLE_MAX} characters)` };
  if (tooLong(body.description, JOB_DESCRIPTION_MAX)) return { error: `Description is too long (max ${JOB_DESCRIPTION_MAX.toLocaleString('en-US')} characters)` };
  const title = str(body.title, JOB_TITLE_MAX);
  const description = str(body.description, JOB_DESCRIPTION_MAX);
  const { job_type } = body;
  // Pay in USD with cents, per hour / month / year, or a fixed price for the whole job.
  const money = (v) => (num(v) == null ? null : Math.round(num(v) * 100) / 100);
  const salary_min = money(body.salary_min);
  const salary_max = money(body.salary_max);
  const salary_period = body.salary_period ?? 'month';
  if (!PERIODS.includes(salary_period)) return { error: 'Invalid pay period' };
  if ([salary_min, salary_max].some((v) => v != null && (v < 0 || v > 10_000_000))) return { error: 'Salary must be between 0 and 10,000,000' };
  if (!title || !description) return { error: 'Title and description required' };
  if (!TYPES.includes(job_type)) return { error: 'Invalid job type' };
  if (salary_min != null && salary_max != null && salary_min > salary_max) return { error: 'Min salary is above max' };
  // Optional cap the employer sets ("up to 50 applications"); empty means the most their plan allows (jobCap).
  const max_applications = body.max_applications == null || body.max_applications === '' ? null : Number(body.max_applications);
  if (max_applications !== null && !(Number.isInteger(max_applications) && max_applications >= 1 && max_applications <= 5000))
    return { error: 'Application limit must be a whole number from 1 up' };
  return { values: [title, description, skillList(body.skills), job_type, salary_min, salary_max, salary_period, max_applications] };
}

// ponytail: deleting a job frees its slot for the month; keep deleted jobs (soft delete) if that gets abused.
export const postLimitMessage = (plan, max) => `You've posted ${max} jobs this month, the most on the ${PLAN_LIMITS[plan].name} plan. ` +
  (plan === 'free' ? 'Upgrade to Pro for 5 a month or Premium for 10, or wait' : plan === 'pro' ? 'Upgrade to Premium for 10 a month, or wait' : 'Wait')
  + ' until the 1st, when your limit resets.';
