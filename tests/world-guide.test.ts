/** City guide shelves. Run with `npm test`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cityGuide, inPlace } from '../src/lib/world-guide.ts';
import type { Listing } from '../src/types/directory';

const BHM = { name: 'Birmingham', lat: 33.52, lng: -86.8 };
const loc = (lat: number, lng: number) => ({ city: 'X', country: 'US', lat, lng, precision: 'approximate' as const });
let n = 0;
const musician = (spec: string, opts: { collab?: boolean; verified?: boolean; at?: [number, number] } = {}): Listing => ({
  id: `m${++n}`, kind: 'musician', slug: `m${n}`, name: `M${n}`, location: loc(...(opts.at ?? [33.5, -86.8])),
  primarySpecialty: spec as never, specialties: [], genres: [], verification: opts.verified ? 'verified' : 'none', openToCollab: !!opts.collab,
});
const studio = (at: [number, number] = [33.5, -86.8]): Listing => ({
  id: `s${++n}`, kind: 'studio', slug: `s${n}`, name: `S${n}`, location: loc(...at), studioType: 'commercial',
  services: [], equipment: [], verification: 'none', plan: 'none', acceptsBookingRequests: true,
});

test('only members near the place count', () => {
  const near = musician('producer'), far = musician('producer', { at: [51.5, -0.1] });
  assert.deepEqual(inPlace([near, far], BHM).map((l) => l.id), [near.id]);
});

test('shelves: top specialty first, then studios, then other specialties, collab and orgs', () => {
  const ls = [musician('producer'), musician('producer'), musician('producer', { collab: true }), musician('vocalist', { collab: true }), musician('vocalist'), musician('dj'), studio()];
  const g = cityGuide(ls, BHM);
  assert.equal(g.total, 7); assert.equal(g.musicians, 6); assert.equal(g.studios, 1);
  assert.deepEqual(g.shelves.map((s) => s.key), ['spec-producer', 'studios', 'spec-vocalist', 'collab']);
  assert.equal(g.shelves[0]!.title, 'Music Producers');
  assert.deepEqual(g.shelves[0]!.filter, { kind: 'musician', specialty: 'producer' });
});

test('verified members lead a shelf', () => {
  const a = musician('producer'), b = musician('producer', { verified: true });
  assert.equal(cityGuide([a, b], BHM).shelves[0]!.items[0]!.id, b.id);
});

test('an empty place has no shelves', () => {
  assert.deepEqual(cityGuide([], BHM).shelves, []);
});
