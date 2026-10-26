// Small input helpers shared by every module.

export const str = (v, max = 5000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));

export const skillList = (v) =>
  [...new Set((Array.isArray(v) ? v : String(v ?? '').split(','))
    .map((s) => String(s).trim().toLowerCase().slice(0, 50)).filter(Boolean))].slice(0, 30);

export const bad = (res, error) => res.status(400).json({ error });
