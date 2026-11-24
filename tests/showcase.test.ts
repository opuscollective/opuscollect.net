import test from 'node:test';
import assert from 'node:assert/strict';
import { canShowcase, showcasePicks } from '../src/lib/showcase.ts';

test('the full showcase is for Verified members only', () => {
  const page = { essentials: ['a', 'b'], featured: null };
  assert.deepEqual(showcasePicks(page, true).full, ['a', 'b']);
  assert.deepEqual(showcasePicks(page, false), { full: [], featured: null });
  assert.equal(showcasePicks({ essentials: ['a'], featured: 'z' }, false).featured, 'z');
  assert.equal(showcasePicks({ essentials: [], featured: null }, false).featured, null);
  assert.equal(canShowcase('verified'), true);
  assert.equal(canShowcase('none'), false);
});
