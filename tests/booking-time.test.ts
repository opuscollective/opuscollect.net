/**
 * Booking-time rules. Run with `npm test` (Node's built-in runner; no extra packages).
 * These cover the cases that cause real double bookings or wrong times: time zones,
 * daylight saving changes, buffers, notice periods and closed days.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { availableSlots, cells, zonedToUtc, localDay, addDays, weekdayOf, SLOT_MS, type SlotQuery } from '../src/lib/booking-time.ts';

const CHI = 'America/Chicago';

test('zonedToUtc converts Chicago wall time in winter and summer', () => {
  assert.equal(new Date(zonedToUtc('2026-01-15', 10 * 60, CHI)).toISOString(), '2026-01-15T16:00:00.000Z'); // CST, UTC-6
  assert.equal(new Date(zonedToUtc('2026-07-15', 10 * 60, CHI)).toISOString(), '2026-07-15T15:00:00.000Z'); // CDT, UTC-5
});

test('zonedToUtc is correct on both daylight saving change days', () => {
  // 2026-03-08: clocks go forward at 2:00. 10:00 that day is CDT.
  assert.equal(new Date(zonedToUtc('2026-03-08', 10 * 60, CHI)).toISOString(), '2026-03-08T15:00:00.000Z');
  // 2026-11-01: clocks go back at 2:00. 10:00 that day is CST.
  assert.equal(new Date(zonedToUtc('2026-11-01', 10 * 60, CHI)).toISOString(), '2026-11-01T16:00:00.000Z');
});

test('localDay and weekday helpers', () => {
  assert.equal(localDay(Date.parse('2026-11-10T03:00:00Z'), CHI), '2026-11-09'); // 9 pm the evening before
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(weekdayOf('2026-11-09'), 1); // Monday
});

test('cells cover the session plus buffer in 15-minute steps', () => {
  const at = Date.parse('2026-11-10T16:00:00Z');
  assert.deepEqual(cells(at, 60).map((c) => (c - at) / SLOT_MS), [0, 1, 2, 3]);
  assert.equal(cells(at, 120 + 30).length, 10);
});

const base = (over: Partial<SlotQuery> = {}): SlotQuery => ({
  tz: CHI,
  rules: [{ weekday: 2, start_min: 10 * 60, end_min: 14 * 60 }], // Tuesdays 10:00–14:00
  closedDays: new Set(),
  taken: new Set(),
  durationMin: 120,
  bufferMin: 0,
  minNoticeHours: 0,
  maxDaysAhead: 60,
  now: Date.parse('2026-11-09T12:00:00Z'), // Monday
  fromDay: '2026-11-09',
  days: 7,
  ...over,
});
const tuesday = (r: ReturnType<typeof availableSlots>) => r.find((d) => d.day === '2026-11-10')!.starts;

test('offers half-hourly starts that fit inside opening hours', () => {
  const starts = tuesday(availableSlots(base()));
  // 10:00, 10:30, 11:00, 11:30, 12:00 (a 2 h session must end by 14:00)
  assert.equal(starts.length, 5);
  assert.equal(new Date(starts[0]!).toISOString(), '2026-11-10T16:00:00.000Z');
  assert.equal(new Date(starts.at(-1)!).toISOString(), '2026-11-10T18:00:00.000Z');
});

test('a held time blocks every overlapping start, including the buffer', () => {
  const held = new Set(cells(zonedToUtc('2026-11-10', 12 * 60, CHI), 60)); // 12:00–13:00 taken
  const starts = tuesday(availableSlots(base({ taken: held, bufferMin: 30 })));
  // A 2 h session plus 30 min buffer starting 10:00 needs 10:00–12:30, which hits 12:00. Nothing fits.
  assert.deepEqual(starts, []);
  const noBuffer = tuesday(availableSlots(base({ taken: held, durationMin: 60 })));
  // 1 h sessions: 10:00, 10:30, 11:00 fit before 12:00; 13:00 fits after.
  assert.deepEqual(noBuffer.map((t) => localMinutes(t)), [600, 630, 660, 780]);
});

test('minimum notice and closed days remove starts', () => {
  const notice = availableSlots(base({ minNoticeHours: 30 })); // earliest = Tue 18:00 UTC (12:00 local)
  assert.equal(tuesday(notice).length, 1);
  const closed = availableSlots(base({ closedDays: new Set(['2026-11-10']) }));
  assert.deepEqual(tuesday(closed), []);
});

test('max days ahead stops offering far-future starts', () => {
  const r = availableSlots(base({ maxDaysAhead: 0, minNoticeHours: 0 }));
  assert.deepEqual(tuesday(r), []);
});

function localMinutes(t: number) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: CHI, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(t));
  return Number(p.find((x) => x.type === 'hour')!.value) * 60 + Number(p.find((x) => x.type === 'minute')!.value);
}
