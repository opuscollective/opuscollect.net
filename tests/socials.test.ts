import test from 'node:test';
import assert from 'node:assert/strict';
import { SOCIALS, expandHandle, socialLinks } from '../src/data/socials.ts';

test('keys are unique and every service has a label, an icon and a placeholder', () => {
  assert.equal(new Set(SOCIALS.map((s) => s.key)).size, SOCIALS.length);
  for (const s of SOCIALS) assert.ok(s.label && s.icon.startsWith('M') && s.placeholder, s.key);
  for (const k of ['instagram', 'tiktok', 'facebook', 'x', 'youtube', 'spotify', 'appleMusic', 'soundcloud', 'website']) assert.ok(SOCIALS.some((s) => s.key === k), k);
});
test('a bare handle becomes that service’s link; a link or a domain is left alone', () => {
  assert.equal(expandHandle('instagram', '@opuscollect_'), 'https://instagram.com/opuscollect_');
  assert.equal(expandHandle('tiktok', 'opus.collective'.replace('.', '_')), 'https://www.tiktok.com/@opus_collective');
  assert.equal(expandHandle('instagram', 'instagram.com/you'), 'instagram.com/you');
  assert.equal(expandHandle('website', 'yourname.com'), 'yourname.com');
  assert.equal(expandHandle('spotify', 'someone'), 'someone'); // no handle form: the host check on save rejects it
  assert.equal(expandHandle('x', ''), '');
});
test('saved links come back in the house order, only the ones set', () => {
  const out = socialLinks({ website: 'https://a.example', instagram: 'https://instagram.com/a', nope: 'https://x.example' });
  assert.deepEqual(out.map((x) => x.key), ['instagram', 'website']);
});
