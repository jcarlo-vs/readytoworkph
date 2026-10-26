// Hiring analytics queries (Premium): one employer's applications over a period, against the period before.
import { pool } from '../../db/index.js';

// `days`: 7, 30 or 90. `jobId`: one job, or null for all. Charts count Philippine days (or weeks for 90 days).
export async function report(employerId, days, jobId) {
  const now = Date.now();
  const since = new Date(now - days * 864e5), before = new Date(now - 2 * days * 864e5);
  const mineAt = (n) => `j.employer_id = $1 AND ($${n}::int IS NULL OR j.id = $${n})`; // $n is the job filter
  const mine = mineAt(4);
  const messaged = 'EXISTS (SELECT 1 FROM messages m WHERE m.sender_id = $1 AND m.recipient_id = a.worker_id)';
  const replied = 'EXISTS (SELECT 1 FROM messages m WHERE m.sender_id = a.worker_id AND m.recipient_id = $1)';
  const score = "(a.analysis->>'score')::int";
  const cur = 'a.created_at >= $2', prev = 'a.created_at >= $3 AND a.created_at < $2';
  const p = [employerId, since, before, jobId];
  const unit = days <= 30 ? 'day' : 'week';
  const buckets = unit === 'day' ? days : 13;

  const [{ rows: [t] }, { rows: [first] }, { rows: chart }, { rows: candidates }, { rows: jobs }] = await Promise.all([
    pool.query(`SELECT
         (count(*) FILTER (WHERE ${cur}))::int AS applicants, (count(*) FILTER (WHERE ${prev}))::int AS applicants_prev,
         round(avg(${score}) FILTER (WHERE ${cur}))::int AS avg_score, round(avg(${score}) FILTER (WHERE ${prev}))::int AS avg_score_prev,
         (count(*) FILTER (WHERE ${cur} AND a.analysis IS NOT NULL))::int AS scored,
         (count(*) FILTER (WHERE ${cur} AND ${messaged}))::int AS messaged, (count(*) FILTER (WHERE ${prev} AND ${messaged}))::int AS messaged_prev,
         (count(*) FILTER (WHERE ${cur} AND ${messaged} AND ${replied}))::int AS replied, (count(*) FILTER (WHERE ${prev} AND ${messaged} AND ${replied}))::int AS replied_prev,
         (count(*) FILTER (WHERE ${cur} AND ${score} >= 85))::int AS strong,
         (count(*) FILTER (WHERE ${cur} AND ${score} BETWEEN 65 AND 84))::int AS good,
         (count(*) FILTER (WHERE ${cur} AND ${score} BETWEEN 40 AND 64))::int AS partial,
         (count(*) FILTER (WHERE ${cur} AND ${score} < 40))::int AS poor
       FROM applications a JOIN jobs j ON j.id = a.job_id WHERE ${mine}`, p),
    // median hours from posting a job to its first application
    pool.query(`SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY h))::int AS hours FROM (
         SELECT extract(epoch FROM min(a.created_at) - j.created_at) / 3600 AS h
         FROM jobs j JOIN applications a ON a.job_id = j.id WHERE ${mineAt(2)} GROUP BY j.id) x`, [employerId, jobId]),
    pool.query(`SELECT to_char(b, 'YYYY-MM-DD') AS start, count(a.id)::int AS applicants
       FROM generate_series(date_trunc($3, now() AT TIME ZONE 'Asia/Manila') - ($4::int - 1) * ('1 ' || $3)::interval,
                            date_trunc($3, now() AT TIME ZONE 'Asia/Manila'), ('1 ' || $3)::interval) b
       LEFT JOIN (applications a JOIN jobs j ON j.id = a.job_id AND ${mineAt(2)})
         ON date_trunc($3, a.created_at AT TIME ZONE 'Asia/Manila') = b
       GROUP BY b ORDER BY b`, [employerId, jobId, unit, buckets]),
    // open jobs only: people you could still hire
    pool.query(`SELECT a.id, a.job_id, a.worker_id, u.name, j.title, ${score} AS score, a.credits
       FROM applications a JOIN jobs j ON j.id = a.job_id JOIN users u ON u.id = a.worker_id
       WHERE ${mineAt(2)} AND j.closed_at IS NULL AND a.analysis IS NOT NULL AND NOT ${messaged}
       ORDER BY score DESC, a.credits DESC, a.created_at LIMIT 5`, [employerId, jobId]),
    // every job (it's also the job picker), its numbers for the period, and a 12-week trend
    pool.query(`SELECT j.id, j.title, j.created_at, j.closed_at,
         (count(a.id) FILTER (WHERE ${cur}))::int AS applicants,
         (count(a.id) FILTER (WHERE a.created_at > now() - interval '7 days'))::int AS new_7d,
         (count(a.analysis) FILTER (WHERE ${cur}))::int AS scored,
         round(avg(${score}) FILTER (WHERE ${cur}))::int AS avg_score,
         max(${score}) FILTER (WHERE ${cur}) AS top_score,
         (count(DISTINCT a.worker_id) FILTER (WHERE ${cur} AND ${messaged}))::int AS messaged,
         round(extract(epoch FROM min(a.created_at) - j.created_at) / 3600)::int AS hours_to_first,
         (SELECT array_agg(n ORDER BY w) FROM (
            SELECT w, count(b.id)::int AS n
            FROM generate_series(date_trunc('week', now() AT TIME ZONE 'Asia/Manila') - interval '11 weeks',
                                 date_trunc('week', now() AT TIME ZONE 'Asia/Manila'), interval '1 week') w
            LEFT JOIN applications b ON b.job_id = j.id AND date_trunc('week', b.created_at AT TIME ZONE 'Asia/Manila') = w
            GROUP BY w) s) AS trend
       FROM jobs j LEFT JOIN applications a ON a.job_id = j.id
       WHERE j.employer_id = $1 GROUP BY j.id ORDER BY j.closed_at IS NOT NULL, j.created_at DESC`, [employerId, since]),
  ]);
  return { t, first, chart, candidates, jobs, unit };
}
