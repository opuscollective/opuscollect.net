/** Vibe matching for release collaborator search. Run with `npm test`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankByVibe, vibeMatch } from '../src/lib/vibe.ts';

const release = { genres: ['R&B', 'Hip-Hop'], moods: ['Moody', 'Atmospheric'] };

test('shared genres and moods both count, genres more', () => {
  const g = vibeMatch(release, { genres: ['R&B'], moods: [] });
  const m = vibeMatch(release, { genres: [], moods: ['Moody'] });
  assert.deepEqual(g.genres, ['R&B']);
  assert.deepEqual(m.moods, ['Moody']);
  assert.ok(g.score > m.score);
});

test('no overlap scores zero', () => {
  assert.equal(vibeMatch(release, { genres: ['Country'], moods: ['Hype'] }).score, 0);
});

test('a mood across several releases adds a little, with a cap', () => {
  const once = vibeMatch(release, { genres: [], moods: ['Moody'] }).score;
  const thrice = vibeMatch(release, { genres: [], moods: ['Moody', 'Moody', 'Moody'] }).score;
  const many = vibeMatch(release, { genres: [], moods: Array(10).fill('Moody') }).score;
  assert.ok(thrice > once);
  assert.equal(many, thrice);
});

test('ranking: score first, then open to collaboration, then name', () => {
  const mk = (name: string, openToCollab: boolean, genres: string[]) => ({ name, openToCollab, match: vibeMatch(release, { genres, moods: [] }) });
  const ranked = rankByVibe([mk('Cee', false, ['R&B']), mk('Bee', true, ['R&B']), mk('Ay', true, []), mk('Dee', false, ['R&B', 'Hip-Hop'])]);
  assert.deepEqual(ranked.map((r) => r.name), ['Dee', 'Bee', 'Cee', 'Ay']);
});
