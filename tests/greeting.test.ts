import test from 'node:test';
import assert from 'node:assert/strict';
import { dayPart, greeting } from '../src/lib/greeting.ts';

test('time of day picks the part', () => {
  assert.equal(dayPart(5), 'morning'); assert.equal(dayPart(12), 'afternoon'); assert.equal(dayPart(17), 'evening'); assert.equal(dayPart(23), 'night'); assert.equal(dayPart(3), 'night');
});
test('at home it greets by time and name', () => {
  assert.equal(greeting({ name: 'Bogo Leny', hour: 12, day: 0, home: 'Birmingham' }).line, 'Good afternoon, Bogo.');
  assert.equal(greeting({ name: 'Bogo', hour: 12, day: 0, home: 'Birmingham' }).sub, 'Here’s what’s happening in Birmingham.');
});
test('away from home it welcomes them to the city', () => {
  const g = greeting({ name: 'Bogo', hour: 9, day: 0, home: 'Birmingham', away: 'Atlanta' });
  assert.equal(g.line, 'Welcome to Atlanta.'); assert.equal(g.city, 'Atlanta');
  assert.equal(greeting({ name: 'Bogo', hour: 9, day: 0, home: 'Atlanta', away: 'Atlanta' }).line, 'Good morning, Bogo.');
});
test('no line ever leaves a placeholder or a dangling comma, with or without a name', () => {
  for (let day = 0; day < 6; day++) for (const hour of [6, 13, 19, 1]) for (const name of ['Bogo', '', null]) for (const away of [null, 'Lagos']) {
    const { line } = greeting({ name, hour, day, home: 'Birmingham', away });
    assert.ok(!/[{}]/.test(line) && !/, ?\./.test(line) && !/^[,. ]/.test(line), line);
  }
});
