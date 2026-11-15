import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMotion, dur } from '../src/lib/motion.ts';
import { countsLine, cityGuideHeader } from '../src/lib/city-guide-html.ts';
import { CITY_GUIDES } from '../src/data/city-guides.ts';
import { PLACE_BY_ID } from '../src/data/places.ts';

test('motion: an explicit choice wins over the device setting', () => {
  assert.equal(resolveMotion('fluid', true), 'fluid');
  assert.equal(resolveMotion('off', false), 'off');
  assert.equal(resolveMotion('reduced', false), 'reduced');
});
test('motion: auto follows the device, and a struggling session stays reduced', () => {
  assert.equal(resolveMotion('auto', false), 'fluid');
  assert.equal(resolveMotion('auto', true), 'reduced');
  assert.equal(resolveMotion('auto', false, 'reduced'), 'reduced');
});
test('motion: durations scale by mode', () => {
  assert.equal(dur(400, 'fluid'), 400);
  assert.equal(dur(400, 'reduced'), 200);
  assert.equal(dur(400, 'off'), 0);
});
test('city guides: every entry points at a real metro and has a licensed, credited photo', () => {
  for (const g of Object.values(CITY_GUIDES)) {
    const p = PLACE_BY_ID.get(g.id);
    assert.ok(p && p.kind === 'metro', `${g.id} is a metro`);
    assert.equal(p!.name, g.name);
    if (g.photo) { assert.ok(g.photo.credit && g.photo.license && g.photo.licenseUrl.startsWith('https://')); assert.ok(g.photo.alt.length > 10); }
  }
});
test('city guide header: live counts, honest empty line, escaped text', () => {
  assert.equal(countsLine({ name: 'X', total: 3, musicians: 2, studios: 1, organizations: 0 }), '2 professionals · 1 studio on Opus');
  assert.equal(countsLine({ name: 'X', total: 0, musicians: 0, studios: 0, organizations: 0 }), 'No one in X has published a profile yet');
  const html = cityGuideHeader({ name: '<b>', total: 0, musicians: 0, studios: 0, organizations: 0 }, { followId: 'us-al-birmingham' });
  assert.ok(!html.includes('<b>') && html.includes('&lt;b&gt;'));
  assert.ok(html.includes('data-follow="us-al-birmingham"'));
});
