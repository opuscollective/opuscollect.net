import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOCIALS, handleOf, handleShape } from '../src/data/socials.ts';

test('a username becomes the link and reads back as the username', () => {
  for (const s of SOCIALS) {
    const shape = handleShape(s.key);
    if (!shape) continue;
    const url = `https://${shape.pre}some.name_1${shape.suf}`;
    assert.equal(handleOf(s.key, url), 'some.name_1', s.key);
    assert.equal(handleOf(s.key, url + '/'), 'some.name_1', s.key);
  }
});

test('addresses that are not a plain username stay as links', () => {
  assert.equal(handleShape('spotify'), null);
  assert.equal(handleShape('appleMusic'), null);
  assert.equal(handleOf('instagram', 'https://instagram.com/p/abc123'), null);
  assert.equal(handleOf('youtube', 'https://www.youtube.com/channel/UC123'), null);
  assert.equal(handleOf('instagram', 'https://www.instagram.com/bogo?igsh=1'), 'bogo');
  assert.deepEqual(handleShape('tiktok'), { pre: 'www.tiktok.com/@', suf: '' });
  assert.deepEqual(handleShape('bandcamp'), { pre: '', suf: '.bandcamp.com' });
});
