// Fake jobs for local testing only. Refuses to run against any database that isn't on this machine.
//   npm run seed:jobs              add 300 jobs from 25 made-up employers (@seed.test)
//   npm run seed:jobs -- 500       add 500 instead
//   npm run seed:jobs -- refresh   re-date the fake jobs across the last 14 days so they look new
//   npm run seed:jobs -- wipe      delete the fake employers and all their jobs
import { pool } from '../db/index.js';
import { sampleEmployers, sampleJob } from '../modules/sample-jobs/sample-jobs.service.js';

const host = new URL(process.env.DATABASE_URL || 'postgres://x').hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`Not a local database (${host}). Fake jobs are for local testing only.`);
  process.exit(1);
}

const SEED = '%@seed.test';
const AGE = `now() - random() * interval '14 days'`; // fresh-looking spread, newest near "just now"
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
  const ids = await sampleEmployers(pool);
  for (let i = 0; i < count; i++) {
    const j = sampleJob();
    await pool.query(
      `INSERT INTO jobs (employer_id, title, description, skills, job_type, salary_min, salary_max, salary_period, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ${AGE})`,
      [ids[i % ids.length], j.title, j.description, j.skills, j.job_type, j.salary_min, j.salary_max, j.salary_period]);
  }
  console.log(`Added ${count} fake jobs from ${ids.length} employers`);
}
await pool.end();
