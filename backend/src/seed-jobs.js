// Fake jobs for local testing only. Refuses to run against any database that isn't on this machine.
//   npm run seed:jobs              add 300 jobs from 25 made-up employers (@seed.test)
//   npm run seed:jobs -- 500       add 500 instead
//   npm run seed:jobs -- refresh   re-date the fake jobs across the last 14 days so they look new
//   npm run seed:jobs -- wipe      delete the fake employers and all their jobs
import { pool } from './db.js';

const host = new URL(process.env.DATABASE_URL || 'postgres://x').hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`Not a local database (${host}). Fake jobs are for local testing only.`);
  process.exit(1);
}

const SEED = '%@seed.test';
const AGE = `now() - random() * interval '14 days'`; // fresh-looking spread, newest near "just now"
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const COMPANIES = ['Brightlane Studio', 'Harbor & Pine', 'Northwind Goods', 'Kettle Creek Media', 'Bluefin Logistics',
  'Copperleaf Dental', 'Maple Row Realty', 'Tidewater Labs', 'Sunday Supply Co', 'Granite Peak Coaching',
  'Lumen Health Partners', 'Orchard Lane Bakery', 'Saltbox Design', 'Ridgeway Accounting', 'Fable & Fern',
  'Pinecrest Property Group', 'Wavelength Podcasts', 'Oak & Anchor Legal', 'Summit Fitness Online', 'Little Owl Learning',
  'Cobalt Commerce', 'Meadowbrook Pets', 'Ironbridge Solar', 'Juniper Travel', 'Starling Software'];

// [title, skills, job_type, salary_min, salary_max, salary_period, description]
const ROLES = [
  ['Virtual Assistant', ['admin', 'email management', 'scheduling'], 'full-time', 500, 800, 'month',
    'Manage the owner\'s inbox and calendar, book meetings, keep files tidy in Google Drive and follow up with clients.'],
  ['Customer Support Specialist', ['customer service', 'email support', 'zendesk'], 'full-time', 4, 6, 'hour',
    'Answer customer emails and live chat, handle refunds and order problems, and log common issues for the team.'],
  ['Social Media Manager', ['social media', 'canva', 'content writing'], 'part-time', 400, 700, 'month',
    'Plan and post content on Instagram, Facebook and TikTok, reply to comments and share a short report each month.'],
  ['Bookkeeper', ['bookkeeping', 'xero', 'quickbooks'], 'part-time', 6, 9, 'hour',
    'Record transactions, reconcile bank accounts each week and prepare simple monthly reports for the owner.'],
  ['Shopify Store Assistant', ['shopify', 'product listing', 'customer service'], 'full-time', 5, 8, 'hour',
    'Upload products, update prices and stock, process orders and answer shopper questions.'],
  ['Graphic Designer', ['graphic design', 'canva', 'photoshop'], 'gig', 150, 300, 'fixed',
    'Design a set of social media templates and ad graphics that match our brand colours and fonts.'],
  ['Video Editor', ['video editing', 'premiere pro', 'capcut'], 'part-time', 7, 12, 'hour',
    'Edit short videos for YouTube and Reels: cut, add captions, music and simple motion graphics.'],
  ['Data Entry Assistant', ['data entry', 'excel', 'google sheets'], 'gig', 4, 5, 'hour',
    'Copy product details from supplier PDFs into our spreadsheet and check them for mistakes.'],
  ['Appointment Setter', ['cold calling', 'sales', 'crm'], 'full-time', 600, 900, 'month',
    'Call and message leads, book calls into the sales team\'s calendar and keep the CRM up to date.'],
  ['SEO Specialist', ['seo', 'wordpress', 'google analytics'], 'part-time', 8, 12, 'hour',
    'Research keywords, improve existing blog posts and fix technical issues found in Search Console.'],
  ['Content Writer', ['content writing', 'seo', 'copywriting'], 'gig', 30, 60, 'fixed',
    'Write clear, friendly blog posts (around 1,200 words each) from a brief and an outline we provide.'],
  ['Executive Assistant', ['admin', 'travel booking', 'project management'], 'full-time', 900, 1400, 'month',
    'Support the CEO with inbox, travel, expense reports and meeting notes. Must be organised and proactive.'],
  ['WordPress Developer', ['wordpress', 'php', 'css'], 'gig', 300, 800, 'fixed',
    'Fix layout bugs, speed up page loads and build two new landing pages on our existing theme.'],
  ['Real Estate Assistant', ['admin', 'crm', 'real estate'], 'full-time', 5, 7, 'hour',
    'Update listings, schedule viewings, answer enquiries and keep the transaction checklist moving.'],
  ['Medical Virtual Receptionist', ['customer service', 'scheduling', 'medical admin'], 'full-time', 5, 7, 'hour',
    'Answer patient calls, book and confirm appointments and handle insurance details. US hours.'],
  ['Email Marketing Specialist', ['email marketing', 'klaviyo', 'copywriting'], 'part-time', 8, 11, 'hour',
    'Build email flows and weekly campaigns in Klaviyo, and test subject lines to raise open rates.'],
  ['Project Coordinator', ['project management', 'asana', 'communication'], 'full-time', 800, 1200, 'month',
    'Keep projects on schedule in Asana, run short daily check-ins and update clients on progress.'],
  ['Lead Generation Specialist', ['lead generation', 'linkedin', 'research'], 'part-time', 5, 7, 'hour',
    'Find decision makers on LinkedIn and company websites, verify emails and add them to our list.'],
  ['Podcast Editor', ['audio editing', 'audacity', 'show notes'], 'gig', 40, 80, 'fixed',
    'Edit weekly episodes: remove filler, balance sound, add intro music and write short show notes.'],
  ['Amazon Account Manager', ['amazon seller central', 'product listing', 'ppc'], 'full-time', 700, 1100, 'month',
    'Manage listings, PPC campaigns and inventory for our Amazon store, and report on sales each week.'],
];
const TAGS = ['', '', '', ' (US hours)', ' (AU clients)', ' (UK hours)', ' - Long term', ' - Start ASAP'];
const EXTRAS = ['You will report directly to the owner.', 'Training is provided in the first two weeks.',
  'We use Slack and Google Meet to talk every day.', 'A stable internet connection and a quiet home office are a must.',
  'This is a long-term role for the right person.', 'Please mention your favourite tool for this kind of work when you apply.'];

const arg = process.argv[2];

if (arg === 'wipe') {
  const { rowCount } = await pool.query('DELETE FROM users WHERE email LIKE $1', [SEED]);
  console.log(`Deleted ${rowCount} fake employers and their jobs`);
} else if (arg === 'refresh') {
  const { rowCount } = await pool.query(
    `UPDATE jobs SET created_at = ${AGE}, updated_at = NULL, closed_at = NULL
     WHERE employer_id IN (SELECT id FROM users WHERE email LIKE $1)`, [SEED]);
  console.log(`Re-dated ${rowCount} fake jobs across the last 14 days`);
} else {
  const count = Math.min(5000, Math.max(1, parseInt(arg) || 300));
  const ids = [];
  for (const name of COMPANIES) {
    const email = `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@seed.test`;
    const { rows } = await pool.query(
      `INSERT INTO users (email, name, role, email_verified_at) VALUES ($1, $2, 'employer', now())
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [email, name]);
    ids.push(rows[0].id);
  }
  for (let i = 0; i < count; i++) {
    const [title, skills, type, min, max, period, desc] = pick(ROLES);
    const description = `${desc} ${pick(EXTRAS)} ${pick(EXTRAS)}`;
    await pool.query(
      `INSERT INTO jobs (employer_id, title, description, skills, job_type, salary_min, salary_max, salary_period, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ${AGE})`,
      [pick(ids), title + pick(TAGS), description, skills, type, min, max, period]);
  }
  console.log(`Added ${count} fake jobs from ${ids.length} employers`);
}
await pool.end();
