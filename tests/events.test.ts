/** Event time rules: each event reads in its own time zone, the same for everyone. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatEventWhen, eventEndsAt, isCategory, isRelation } from '../src/lib/events.ts';
import { zonedToUtc } from '../src/lib/booking-time.ts';

const NOW = Date.UTC(2026, 10, 14);

test('an evening in Chicago reads in Central time, with the end on the same day', () => {
  const s = zonedToUtc('2026-12-05', 20 * 60, 'America/Chicago');
  const e = zonedToUtc('2026-12-05', 23 * 60, 'America/Chicago');
  assert.equal(formatEventWhen(s, e, 'America/Chicago', NOW), 'Sat, Dec 5 · 8:00 PM – 11:00 PM CST');
});

test('an event past midnight shows both days', () => {
  const s = zonedToUtc('2026-12-05', 22 * 60, 'Europe/London');
  const e = zonedToUtc('2026-12-06', 2 * 60, 'Europe/London');
  assert.match(formatEventWhen(s, e, 'Europe/London', NOW), /^Sat, Dec 5 · 10:00 PM GMT – Sun, Dec 6 · 2:00 AM GMT$/);
});

test('next year includes the year; daylight saving gives CDT', () => {
  const s = zonedToUtc('2027-06-21', 19 * 60, 'America/Chicago');
  assert.equal(formatEventWhen(s, null, 'America/Chicago', NOW), 'Mon, Jun 21, 2027 · 7:00 PM CDT');
});

test('without an end, an event counts as running three hours', () => {
  assert.equal(eventEndsAt(1000, null), 1000 + 3 * 3_600_000);
  assert.equal(eventEndsAt(1000, 5000), 5000);
});

test('only known categories and relations are accepted (no ticket or RSVP states)', () => {
  assert.ok(isCategory('open_mic'));
  assert.ok(!isCategory('ticketed'));
  assert.ok(isRelation('going'));
  assert.ok(!isRelation('rsvp'));
  assert.ok(!isRelation('ticket'));
});
