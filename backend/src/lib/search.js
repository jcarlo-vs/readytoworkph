// Turns a search box into Postgres regexes, one per word; a row must match every one (any order, any field).
import { str } from './validate.js';

// Words people write joined, split or hyphenated ("full stack", "full-stack", "fullstack"): matched in every form.
const JOINED = [['full', 'stack'], ['front', 'end'], ['back', 'end'], ['e', 'commerce'], ['copy', 'writ'], ['book', 'keep'],
  ['web', 'site'], ['dev', 'ops'], ['short', 'form'], ['cold', 'call'], ['life', 'coach'], ['no', 'code'], ['low', 'code']];

// Special characters taken literally, matched at word starts (\m), and short words (ai, va, seo) only as whole
// words (\M), so "ai" doesn't match "email". Longer words also match longer forms ("engineer" → "engineering"). Up to 6.
export function searchWords(q) {
  let text = str(q, 100).toLowerCase();
  const joined = [];
  for (const [a, b] of JOINED) {
    text = text.replace(new RegExp(`(^|[^a-z])${a}[\\s-]?${b}[a-z]*`, 'g'), (m, before) => { joined.push(`\\m${a}[\\s-]?${b}`); return `${before} `; });
  }
  const words = text.split(/[\s,;/]+/).filter(Boolean)
    .map((w) => `${/^\w/.test(w) ? '\\m' : ''}${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${w.length <= 3 && /\w$/.test(w) ? '\\M' : ''}`);
  return [...new Set([...joined, ...words])].slice(0, 6);
}
