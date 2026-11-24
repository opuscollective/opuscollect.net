/** Listening party clock: the rules every device and the room share. Run with `npm test`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, clockOffset, correction, initialState, positionAt, settle, startsLabel, trackEndsAt } from '../src/lib/party.ts';

const D = [180_000, 200_000];

test('a late joiner lands where the music is', () => {
  const s = apply(initialState(), 'start', D, 1_000_000);
  assert.equal(s.status, 'playing');
  assert.equal(positionAt(s, 1_120_000), 120_000);
});

test('tracks roll over on their own and the party ends after the last one', () => {
  const s = apply(initialState(), 'start', D, 0);
  assert.equal(trackEndsAt(s, D), 180_000);
  const mid = settle(s, D, 190_000);
  assert.deepEqual([mid.track, positionAt(mid, 190_000)], [1, 10_000]);
  assert.equal(settle(s, D, 380_001).status, 'ended');
  assert.equal(settle(s, D, 100_000), s);
});

test('pause holds the position and resume carries on from it', () => {
  const s = apply(initialState(), 'start', D, 0);
  const p = apply(s, 'pause', D, 30_000);
  assert.deepEqual([p.status, positionAt(p, 90_000)], ['paused', 30_000]);
  assert.equal(settle(p, D, 10_000_000), p);
  assert.equal(positionAt(apply(p, 'resume', D, 100_000), 105_000), 35_000);
});

test('next moves on, and next on the last track ends it', () => {
  const s = apply(initialState(), 'start', D, 0);
  const n = apply(s, 'next', D, 5_000);
  assert.deepEqual([n.track, n.pos, n.status], [1, 0, 'playing']);
  assert.equal(apply(n, 'next', D, 6_000).status, 'ended');
  assert.equal(apply(apply(s, 'end', D, 1), 'start', D, 2).status, 'ended');
});

test('a party with no audio cannot start', () => {
  const s = initialState();
  assert.equal(apply(s, 'start', [], 0), s);
});

test('clock offset trusts the fastest round trip', () => {
  const o = clockOffset([{ sent: 0, server: 5_400, received: 800 }, { sent: 1_000, server: 6_050, received: 1_100 }]);
  assert.equal(o, 5_000);
});

test('small drift is nudged, big drift jumps', () => {
  assert.deepEqual(correction(20), { seek: false, rate: 1 });
  assert.equal(correction(400).rate, 1.04);
  assert.equal(correction(-400).rate, 0.96);
  assert.equal(correction(5_000).seek, true);
});

test('labels', () => {
  assert.equal(startsLabel(0, true, 0, 'x'), 'Live now');
  assert.equal(startsLabel(10 * 60_000, false, 0, 'x'), 'Starts in 10 min');
  assert.equal(startsLabel(3 * 3_600_000, false, 0, 'x'), 'Starts in 3 hours');
  assert.equal(startsLabel(3 * 86_400_000, false, 0, 'Fri 8 PM'), 'Fri 8 PM');
});
