import { readFile } from 'node:fs/promises';
import { pool } from './db.js';

await pool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
console.log('Schema applied');
await pool.end();
