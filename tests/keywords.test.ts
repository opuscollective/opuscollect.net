/** World keyword search: sentences search on their real terms. Run with `npm test`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keywordTokens, matchesKeywords } from '../src/lib/keywords.ts';

const hay = 'Sample Producer 07 Atlanta Atlanta GA US Producer Hip-Hop R&B Mixing Engineer';

test('filler and goal words are ignored', () => {
  assert.deepEqual(keywordTokens("I'm looking for a producer in Atlanta for my next single"), ['producer', 'atlanta']);
  assert.deepEqual(keywordTokens('Find someone'), []);
});

test('every remaining word must match', () => {
  assert.ok(matchesKeywords(hay, keywordTokens('producer in Atlanta')));
  assert.ok(!matchesKeywords(hay, keywordTokens('producer in London')));
  assert.ok(!matchesKeywords(hay, keywordTokens('graphic designer for my next single')));
});

test('plurals match the singular, and genre punctuation survives', () => {
  assert.ok(matchesKeywords(hay, keywordTokens('producers')));
  assert.ok(matchesKeywords(hay, keywordTokens('hip-hop')));
  assert.ok(matchesKeywords(hay, keywordTokens('R&B mixing engineers')));
});

test('a plain name search still works', () => {
  assert.ok(matchesKeywords(hay, keywordTokens('Sample Producer 07')));
});
