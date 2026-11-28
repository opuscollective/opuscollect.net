import test from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, LEVELS, NO_STATS, POINTS, achievements, levelOf, nextUp, points, resolveTitle, titleOptions } from '../src/lib/progress.ts';
import { pageStyle } from '../src/lib/page-style.ts';

test('a new member starts at level 1 with nothing earned', () => {
  assert.equal(points(NO_STATS), 0);
  assert.equal(levelOf(0).level, 1);
  assert.equal(achievements(NO_STATS).filter((a) => a.earned).length, 0);
});

test('connections alone are capped and cannot carry a level', () => {
  const farmer = { ...NO_STATS, connections: 5000 };
  assert.equal(points(farmer), POINTS.connection.cap * POINTS.connection.each);
  assert.ok(levelOf(points(farmer)).level <= 3);
  const worker = { ...NO_STATS, works: 6, creditsEarned: 6 };
  assert.ok(points(worker) > points(farmer));
});

test('levels rise in order and progress stays within 0 and 1', () => {
  for (let i = 1; i < LEVELS.length; i++) assert.ok(LEVELS[i]!.at > LEVELS[i - 1]!.at);
  for (const pts of [0, 99, 100, 777, 5000, 99999]) { const l = levelOf(pts); assert.ok(l.progress >= 0 && l.progress <= 1); }
  assert.equal(levelOf(99999).level, LEVELS.length);
  assert.equal(levelOf(99999).next, null);
});

test('achievement ids are unique and each is earned exactly at its number', () => {
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
  for (const a of ACHIEVEMENTS) {
    assert.equal(achievements({ ...NO_STATS, [a.stat]: a.need - 1 }).find((x) => x.id === a.id)!.earned, false);
    assert.equal(achievements({ ...NO_STATS, [a.stat]: a.need }).find((x) => x.id === a.id)!.earned, true);
  }
});

test('titles show only while earned; Founder only with the account distinction', () => {
  const s = { ...NO_STATS, connections: 10 };
  assert.equal(resolveTitle('a:connections-10', s), 'Connector');
  assert.equal(resolveTitle('a:connections-50', s), null);
  assert.equal(resolveTitle('founder', s), null);
  assert.equal(resolveTitle('founder', s, 'founder'), 'Founder');
  assert.equal(titleOptions(NO_STATS)[0]!.key, 'level');
});

test('next up lists the closest unearned achievements', () => {
  const n = nextUp(achievements({ ...NO_STATS, connections: 9, works: 1 }), 2);
  assert.equal(n[0]!.id, 'connections-10');
});

test('reserved looks fall back unless the account is the founder', () => {
  assert.equal(pageStyle('gold', 'laurel').accent.key, 'ice');
  assert.equal(pageStyle('gold', 'laurel').backdrop, 'aura');
  assert.equal(pageStyle('gold', 'laurel', 'founder').accent.key, 'gold');
  assert.equal(pageStyle('gold', 'laurel', 'founder').backdrop, 'aura');
  assert.equal(pageStyle('', '', 'founder').accent.key, 'ice');
  assert.equal(pageStyle('rose', 'grid', 'founder').backdrop, 'grid');
  assert.equal(pageStyle('nope', 'nope').accent.key, 'ice');
});

test('travel achievements read real connections away from home, never self-marked cities', () => {
  const travel = ACHIEVEMENTS.filter((a) => a.group === 'travel');
  assert.ok(travel.length >= 4);
  for (const a of travel) assert.ok(['awayConnections', 'awayParties', 'connectionCities', 'connectionCountries'].includes(a.stat));
  assert.equal(achievements({ ...NO_STATS, awayConnections: 1 }).find((a) => a.id === 'away-1')!.earned, true);
});

test('feedback given adds points, is capped, and stays below real work', () => {
  assert.equal(points({ ...NO_STATS, feedbackGiven: 1 }), POINTS.feedback.each);
  assert.equal(points({ ...NO_STATS, feedbackGiven: 9999 }), POINTS.feedback.cap * POINTS.feedback.each);
  assert.ok(POINTS.feedback.each < POINTS.work.each && POINTS.feedback.each < POINTS.creditEarned.each);
  assert.ok(achievements({ ...NO_STATS, feedbackGiven: 1 }).find((a) => a.id === 'first-feedback')!.earned);
});
