/** Root-level usernames (opuscollect.net/<username>) must never shadow a real page or file. Run with `npm test`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { RESERVED, slugify, usernameProblem } from '../src/server/usernames.ts';

const top = (dir: string) => readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })
  .map((d) => d.name.replace(/\.(astro|ts|js|md|html|txt|xml|ico|webmanifest)$/, '').replace(/\.xml$/, '').toLowerCase())
  .filter((n) => !n.startsWith('[') && !n.startsWith('.'));

test('every top-level page and folder is reserved', () => {
  for (const name of top('../src/pages/')) assert.ok(RESERVED.has(name), `src/pages/${name} is not in RESERVED (src/server/usernames.ts)`);
});

test('every top-level public file and folder is reserved', () => {
  for (const name of top('../public/')) assert.ok(RESERVED.has(name.split('.')[0]!), `public/${name} is not in RESERVED`);
});

test('username shape rules', () => {
  assert.equal(usernameProblem('bogo'), null);
  assert.equal(usernameProblem('lil-bogo-2'), null);
  assert.match(usernameProblem('ab')!, /at least/);
  assert.match(usernameProblem('-bogo')!, /lowercase/);
  assert.match(usernameProblem('bo--go')!, /lowercase/);
  assert.match(usernameProblem('Bogo')!, /lowercase/);
  assert.match(usernameProblem('world')!, /reserved/);
  assert.match(usernameProblem('sign-in')!, /reserved/);
  assert.equal(slugify('Lil Bógo!'), 'lil-bogo');
});
