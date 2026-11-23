import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allCities, cityFor, nearestCity, searchCities } from '../src/lib/city-search.ts';

test('a city name finds the city', () => {
  const r = searchCities('birm');
  assert.equal(r[0]?.label, 'Birmingham, AL');
});

test('a suburb resolves to its city', () => {
  const r = searchCities('hoover');
  assert.equal(r[0]?.label, 'Birmingham, AL');
  assert.match(r[0]!.sub, /Hoover is in the Birmingham area/);
});

test('aliases and accents work', () => {
  assert.equal(searchCities('atl')[0]?.label, 'Atlanta, GA');
  assert.equal(searchCities('sao paulo')[0]?.label.startsWith('São Paulo'), true);
});

test('nothing typed finds nothing; the full directory is every city once', () => {
  assert.deepEqual(searchCities('  '), []);
  const all = allCities();
  assert.equal(new Set(all.map((c) => c.id)).size, all.length);
  assert.ok(all.length >= 30);
});

test('a point resolves to the nearest city, but not across an ocean', () => {
  assert.equal(nearestCity({ lat: 33.4054, lng: -86.8114 })?.label, 'Birmingham, AL'); // Hoover
  assert.equal(nearestCity({ lat: -45, lng: 170 }), null);
});

test('a saved suburb id maps to its city', () => {
  const hoover = searchCities('hoover')[0]!;
  assert.equal(cityFor(hoover.id)?.id, hoover.id);
  assert.equal(cityFor('nope'), null);
});
