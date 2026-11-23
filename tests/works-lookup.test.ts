import { test } from 'node:test';
import assert from 'node:assert/strict';
import { artworkHostOk, parseItunes, parseOdesli } from '../src/server/works-parse.ts';

test('iTunes results become suggestions with large artwork', () => {
  const r = parseItunes({ results: [
    { trackName: 'Blinding Lights', artistName: 'The Weeknd', collectionName: 'After Hours', artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/abc/100x100bb.jpg', releaseDate: '2019-11-29T12:00:00Z', primaryGenreName: 'Pop', trackViewUrl: 'https://music.apple.com/us/album/x?i=1', trackCount: 14 },
    { artistName: 'No title' },
  ] });
  assert.equal(r.length, 1);
  assert.equal(r[0]!.title, 'Blinding Lights');
  assert.equal(r[0]!.releaseDate, '2019-11-29');
  assert.equal(r[0]!.kind, 'album');
  assert.match(r[0]!.artwork, /\/600x600bb\.jpg$/);
  assert.equal(r[0]!.links.appleMusic, 'https://music.apple.com/us/album/x?i=1');
});

test('bad iTunes payloads give no suggestions', () => {
  assert.deepEqual(parseItunes(null), []);
  assert.deepEqual(parseItunes({ results: 'x' }), []);
});

test('Odesli response gives title, artist, artwork and platform links', () => {
  const r = parseOdesli({
    entityUniqueId: 'SPOTIFY_SONG::1',
    entitiesByUniqueId: { 'SPOTIFY_SONG::1': { title: 'Song', artistName: 'Artist', thumbnailUrl: 'https://i.scdn.co/image/abc', type: 'song' } },
    linksByPlatform: { spotify: { url: 'https://open.spotify.com/track/1' }, appleMusic: { url: 'https://music.apple.com/x' }, youtubeMusic: { url: 'https://music.youtube.com/watch?v=1' } },
  })!;
  assert.equal(r.title, 'Song'); assert.equal(r.artist, 'Artist');
  assert.equal(r.links.spotify, 'https://open.spotify.com/track/1');
  assert.equal(r.links.youtube, 'https://music.youtube.com/watch?v=1');
  assert.equal(parseOdesli({}), null);
});

test('artwork only comes from known cover-art hosts', () => {
  assert.ok(artworkHostOk('https://is1-ssl.mzstatic.com/a.jpg'));
  assert.ok(artworkHostOk('https://i.scdn.co/image/x'));
  assert.ok(!artworkHostOk('http://is1-ssl.mzstatic.com/a.jpg'));
  assert.ok(!artworkHostOk('https://evil.example/mzstatic.com/a.jpg'));
  assert.ok(!artworkHostOk('https://mzstatic.com.evil.example/a.jpg'));
});
