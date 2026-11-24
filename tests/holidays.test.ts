import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holidaysInYear, upcomingHolidays } from '../src/lib/holidays.ts';

test('2026 holidays land on the right days', () => {
  const m = Object.fromEntries(holidaysInYear(2026).map((h) => [h.name, h.day]));
  assert.equal(m['Martin Luther King Jr. Day'], '2026-01-19');
  assert.equal(m['Memorial Day'], '2026-05-25');
  assert.equal(m['Labor Day'], '2026-09-07');
  assert.equal(m['Thanksgiving'], '2026-11-26');
  assert.equal(m['Christmas Day'], '2026-12-25');
});
test('upcoming holidays start at the given day and cover about a year', () => {
  const u = upcomingHolidays('2026-11-24');
  assert.equal(u[0]!.day, '2026-11-26');
  assert.ok(u.length >= 9 && u.length <= 12);
  assert.ok(u.every((h) => h.day >= '2026-11-24' && h.day <= '2027-12-24'));
});
