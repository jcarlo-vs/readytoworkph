// Paging and search helpers for the admin tables.
import { num, str } from './validate.js';

const PAGE_SIZES = [10, 25, 50, 100];
export const sizeOf = (req) => (PAGE_SIZES.includes(Number(req.query.per_page)) ? Number(req.query.per_page) : 25); // rows per page the admin picked
export const like = (v) => `%${str(v, 100).replace(/[\\%_]/g, (c) => `\\${c}`)}%`; // a search term, with LIKE's wildcards taken literally
export const pageOf = (req) => Math.max(0, Math.floor(num(req.query.page) ?? 0));
