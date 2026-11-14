/** Global Chat rules: no promo, no duplicates, the cooldown. Run with `npm test`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessGlobal, cleanBody, cooldownLeft, normalize } from '../src/lib/chat-rules.ts';

const old = { accountAgeMs: 30 * 86_400_000, recentOwn: [] as string[] };
const v = (s: string, ctx = old) => assessGlobal(cleanBody(s), ctx).verdict;

test('ordinary conversation is posted', () => {
  assert.equal(v('Anyone in Birmingham mixing on an SSL this week?'), 'ok');
  assert.equal(v('Good morning from Lagos'), 'ok');
  assert.equal(v('I think Spotify changed their editorial process again'), 'ok');
  assert.equal(v('Who has worked with a string quartet on a pop record?'), 'ok');
});

test('promotion is refused, not just keywords', () => {
  assert.equal(v('Check out my new single on Spotify!!'), 'refuse');
  assert.equal(v('stream my album https://open.spotify.com/album/123'), 'refuse');
  assert.equal(v('beats for sale, dm me for prices'), 'refuse');
  assert.equal(v('hit me at 205 555 0134'), 'refuse');
  assert.equal(v('email me producer@example.com'), 'refuse');
  assert.equal(v('go to mysite.com'), 'refuse');
});

test('borderline messages are posted and flagged for a moderator', () => {
  assert.equal(v('my new single comes out friday'), 'flag');
});

test('Opus links are allowed, other links are not', () => {
  assert.equal(v('My profile is at https://opuscollect.net/m/kira'), 'ok');
  assert.equal(v('see youtube.com/watch?v=1'), 'refuse');
});

test('new accounts cannot post links', () => {
  const r = assessGlobal('look at example.org', { accountAgeMs: 3_600_000, recentOwn: [] });
  assert.equal(r.verdict, 'refuse');
  assert.equal(r.verdict === 'refuse' && r.reason, 'link-new-account');
});

test('repeating yourself is refused, even with different punctuation', () => {
  const recentOwn = [normalize('Anyone want to collab on a house track?')];
  assert.equal(v('anyone want to collab on a house track', { ...old, recentOwn }), 'refuse');
  assert.equal(v('Anyone want to collab on a house track??!', { ...old, recentOwn }), 'refuse');
  assert.equal(v('What tempo do you all write house at?', { ...old, recentOwn }), 'ok');
});

test('the same text from several members is treated as a spam wave', () => {
  assert.equal(v('free mastering for everyone today', { ...old, sameTextOthers: 3 }), 'flag');
});

test('threats are refused', () => {
  assert.equal(v('kys'), 'refuse');
});

test('empty, whitespace and over-long messages are refused', () => {
  assert.equal(v('   \n  '), 'refuse');
  assert.equal(v('x'.repeat(501)), 'refuse');
  assert.equal(v('​​'), 'refuse');
});

test('cooldown counts down from the last accepted send', () => {
  assert.equal(cooldownLeft(undefined, 1000), 0);
  assert.equal(cooldownLeft(10_000, 10_500), 5);
  assert.equal(cooldownLeft(10_000, 14_001), 1);
  assert.equal(cooldownLeft(10_000, 15_000), 0);
});
