import pg from 'pg';

// Small pool per server copy: Cloud Run can run several copies, and the database caps total connections.
// In production DATABASE_URL is Neon's pooled address (with ?sslmode=require).
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.PG_POOL_MAX) || 5 });
