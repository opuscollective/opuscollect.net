import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tzForPlace, zoneName } from '../src/lib/place-tz.ts';
import { CITIES } from '../src/data/cities.ts';

test('every Opus city has a valid time zone', () => {
  for (const c of CITIES) {
    const tz = tzForPlace(c);
    assert.ok(tz, `no zone for ${c.name}`);
    assert.doesNotThrow(() => new Intl.DateTimeFormat('en-US', { timeZone: tz! }), c.name);
  }
});

test('cities land in the zone their clocks use', () => {
  const at = (region: string, lat: number, lng: number) => tzForPlace({ country: 'US', region, lat, lng });
  assert.equal(at('AL', 33.52, -86.8), 'America/Chicago'); // Birmingham
  assert.equal(at('GA', 33.75, -84.39), 'America/New_York'); // Atlanta
  assert.equal(at('TN', 36.16, -86.78), 'America/Chicago'); // Nashville
  assert.equal(at('TN', 35.96, -83.92), 'America/New_York'); // Knoxville
  assert.equal(at('TN', 35.05, -85.31), 'America/New_York'); // Chattanooga
  assert.equal(at('FL', 30.42, -87.22), 'America/Chicago'); // Pensacola
  assert.equal(at('FL', 25.76, -80.19), 'America/New_York'); // Miami
  assert.equal(at('TX', 31.76, -106.49), 'America/Denver'); // El Paso
  assert.equal(at('AZ', 33.45, -112.07), 'America/Phoenix');
  assert.equal(tzForPlace({ country: 'GB', lat: 51.5, lng: -0.1 }), 'Europe/London');
  assert.equal(tzForPlace({ country: 'ZZ', lat: 0, lng: 0 }), null);
});

test('zones are named plainly, not by city', () => {
  assert.equal(zoneName('America/Chicago'), 'Central Time');
  assert.equal(zoneName('America/Toronto'), 'Eastern Time');
});
