// Run: node --test src/lib/time.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timeAgo, postDate } from './time.ts';

test('timeAgo buckets', () => {
  const now = Date.parse('2026-10-16T12:00:00Z');
  const ago = (ms) => timeAgo(new Date(now - ms), now);
  const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  assert.equal(ago(0), 'Just now');
  assert.equal(ago(59_000), 'Just now');
  assert.equal(ago(MIN), 'A few minutes ago');
  assert.equal(ago(4 * MIN + 59_000), 'A few minutes ago');
  assert.equal(ago(5 * MIN), '5m ago');
  assert.equal(ago(59 * MIN), '59m ago');
  assert.equal(ago(HOUR), '1h ago');
  assert.equal(ago(4 * HOUR + 30 * MIN), '4h ago');
  assert.equal(ago(23 * HOUR + 59 * MIN), '23h ago');
  assert.equal(ago(DAY), '1d ago');
  assert.equal(ago(2 * DAY + 5 * HOUR), '2d ago');
  assert.equal(ago(-5 * MIN), 'Just now'); // clock skew: future timestamps don't go negative
  assert.equal(postDate('2026-10-16T12:00:00Z'), 'Oct 16, 2026');
});
