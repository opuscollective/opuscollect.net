/** Future timeline grouping. Run with `npm test`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupByMonth, formatDay, type FutureItem } from '../src/lib/future.ts';

const item = (id: string, day: string | null, at = 0): FutureItem =>
  ({ id, kind: 'session', title: id, detail: '', when: '', day, at, href: '/' });

test('groups upcoming items by month in order, past items dropped', () => {
  const months = groupByMonth([item('c', '2027-01-04'), item('a', '2026-11-20', 2), item('past', '2026-11-01'), item('b', '2026-11-20', 1)], '2026-11-12');
  assert.deepEqual(months.map((m) => m.key), ['2026-11', '2027-01']);
  assert.equal(months[0]!.label, 'November 2026');
  assert.deepEqual(months[0]!.items.map((i) => i.id), ['b', 'a']);
});

test('undated items go last under "No date yet"', () => {
  const months = groupByMonth([item('tba', null), item('x', '2026-12-01')], '2026-11-12');
  assert.deepEqual(months.map((m) => m.label), ['December 2026', 'No date yet']);
});

test('formatDay has no time-zone drift', () => {
  assert.equal(formatDay('2027-03-06'), 'Sat, Mar 6, 2027');
});
