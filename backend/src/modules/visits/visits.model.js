// Website visit queries (page_views) and the IPs the admin leaves out (ignored_ips). Ignored IPs are never
// recorded or shown. IPv6 is matched by its /64 network: a home connection's IPv6 address changes often, its
// network doesn't.
import { pool } from '../../db/index.js';

const NET = `network(set_masklen($1::inet, CASE WHEN family($1::inet) = 6 THEN 64 ELSE 32 END))`;
const NOT_IGNORED = (col) => `NOT EXISTS (SELECT 1 FROM ignored_ips x WHERE ${col}::inet <<= x.net)`;
const VISITS = `(SELECT * FROM page_views p WHERE ${NOT_IGNORED('p.ip')})`;
const since = (period) => `at > now() - interval '${period}'`;

export const record = ({ ip, country, path, referrer, userId, userAgent }) => pool.query(
  `INSERT INTO page_views (ip, country, path, referrer, user_id, user_agent) SELECT $1::text, $2, $3, $4, $5, $6 WHERE ${NOT_IGNORED('$1::text')}`,
  [ip, country, path, referrer, userId, userAgent]);

export const deleteOlderThan = (days) => pool.query(`DELETE FROM page_views WHERE at < now() - interval '${days} days'`);

// Visits and distinct visitors in the last day, 7 days, 30 days, and everything kept.
export const totals = async () => (await pool.query(`SELECT
  count(*) FILTER (WHERE ${since('1 day')})::int AS views_24h, count(DISTINCT ip) FILTER (WHERE ${since('1 day')})::int AS visitors_24h,
  count(*) FILTER (WHERE ${since('7 days')})::int AS views_7d, count(DISTINCT ip) FILTER (WHERE ${since('7 days')})::int AS visitors_7d,
  count(*) FILTER (WHERE ${since('30 days')})::int AS views_30d, count(DISTINCT ip) FILTER (WHERE ${since('30 days')})::int AS visitors_30d,
  count(*)::int AS views_6m, count(DISTINCT ip)::int AS visitors_6m
  FROM ${VISITS} v`)).rows[0];

// The top 15 countries and pages in the period (an interval like '30 days').
export const topCountries = async (period) => (await pool.query(`SELECT coalesce(country, '??') AS country, count(DISTINCT ip)::int AS visitors
  FROM ${VISITS} v WHERE ${since(period)} GROUP BY 1 ORDER BY 2 DESC LIMIT 15`)).rows;
export const topPages = async (period) => (await pool.query(`SELECT path, count(*)::int AS views, count(DISTINCT ip)::int AS visitors
  FROM ${VISITS} v WHERE ${since(period)} GROUP BY 1 ORDER BY 2 DESC LIMIT 15`)).rows;

// One page of visits in the period, newest first, with who it was when signed in; and how many in all.
export async function list(period, size, offset) {
  const { rows } = await pool.query(`SELECT v.id, v.at, v.ip, v.country, v.path, v.referrer, v.user_agent, u.id AS user_id, u.name AS user_name, u.role AS user_role,
      count(*) OVER ()::int AS total
    FROM ${VISITS} v LEFT JOIN users u ON u.id = v.user_id WHERE v.${since(period)} ORDER BY v.at DESC, v.id DESC LIMIT $1 OFFSET $2`, [size, offset]);
  return { visits: rows.map(({ total: _, ...v }) => v), total: rows[0]?.total ?? 0 };
}

export const isIgnored = async (ip) => !(await pool.query(`SELECT ${NOT_IGNORED('$1::text')} AS counted`, [ip])).rows[0].counted;
export const listIgnored = async () => (await pool.query('SELECT net::text AS net, label, added_at FROM ignored_ips ORDER BY added_at DESC')).rows;

// Leaves this IP (its whole IPv6 /64) out; past visits are hidden too.
export const ignore = async (ip, label) => (await pool.query(`INSERT INTO ignored_ips (net, label) VALUES (${NET}, $2)
  ON CONFLICT (net) DO UPDATE SET label = coalesce($2, ignored_ips.label) RETURNING net::text AS net, label, added_at`,
  [ip, label])).rows[0];

export const unignore = async (net) => (await pool.query('DELETE FROM ignored_ips WHERE net::text = $1', [net])).rowCount > 0;
