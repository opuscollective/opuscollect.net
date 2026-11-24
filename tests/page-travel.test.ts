import test from 'node:test';
import assert from 'node:assert/strict';
import { PLACES } from '../src/data/places.ts';

// cleanPage lives in src/server/page-config.ts, which imports through the @/ alias; the rule it applies is checked here on the data.
test('only metro ids can be saved as a current or marked city', () => {
  const metros = PLACES.filter((p) => p.kind === 'metro');
  assert.ok(metros.length > 10);
  assert.ok(metros.every((p) => p.metroId === p.id));
  assert.ok(PLACES.some((p) => p.kind === 'locality' && p.metroId !== p.id));
});
