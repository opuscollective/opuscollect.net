import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs, monthGrid } from '../src/lib/ics.ts';

test('feed has timed sessions, all-day releases and escaped text', () => {
  const ics = buildIcs([
    { id: 'booking-1', title: 'Mixing; "rough", v2', detail: 'Studio A', day: '2026-12-02', at: Date.UTC(2026, 11, 2, 20, 0), href: '/bookings/1', kind: 'session' },
    { id: 'release-1', title: 'Night Drive', detail: 'Single', day: '2027-01-15', at: 0, href: '/works/1', kind: 'release' },
    { id: 'x', title: 'No date', detail: '', day: null, at: 0, href: '/x', kind: 'event' },
  ], 'https://opuscollect.net', Date.UTC(2026, 10, 1));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20261202T200000Z/);
  assert.match(ics, /DTEND:20261202T210000Z/);
  assert.match(ics, /DTSTART;VALUE=DATE:20270115\r\nDTEND;VALUE=DATE:20270116/);
  assert.match(ics, /SUMMARY:Mixing\; "rough"\\, v2/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 2);
  assert.ok(ics.split('\r\n').every((l) => l.length <= 75));
});

test('month grid starts on the right Sunday and covers the month', () => {
  const g = monthGrid('2026-11');
  assert.equal(g[0]![0]!.day, '2026-11-01');
  assert.equal(g.flat().filter((c) => c.inMonth).length, 30);
  assert.ok(g.every((w) => w.length === 7));
});
