/**
 * Finding a work without typing it out.
 *
 * 1. Search inside Opus: Apple's public iTunes Search API (free, no key) returns title, artist, album,
 *    artwork, release date and genre for songs on Apple Music.
 * 2. Paste a link: Odesli (song.link, free without a key at low volume) turns a Spotify, Apple Music, YouTube,
 *    SoundCloud, Tidal... link into the song's title, artist, artwork and the same song on other platforms.
 * 3. Nothing found: the member fills it in by hand, exactly as before.
 *
 * Both services are called from the Worker, never the browser. Everything returned is a suggestion the member
 * reviews before adding. Parsers are pure so tests/works-lookup.test.ts can check them against sample responses.
 */

import { HttpError } from './util';
import { artworkHostOk, parseItunes, parseOdesli, type FoundWork } from './works-parse';
export type { FoundWork } from './works-parse';
export { artworkHostOk };

const UA = { 'user-agent': 'OpusCollective/1.0 (+https://opuscollect.net)' };
const httpsUrl = (v: unknown) => { try { const u = new URL(String(v)); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };
const clean = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');

export async function searchSongs(q: string): Promise<FoundWork[]> {
  const term = clean(q, 100);
  if (term.length < 2) return [];
  const r = await fetch(`https://itunes.apple.com/search?media=music&entity=song&limit=8&term=${encodeURIComponent(term)}`, { headers: UA, cf: { cacheTtl: 3600, cacheEverything: true } } as RequestInit);
  if (!r.ok) throw new HttpError(502, 'Song search is unavailable right now. You can paste a link or enter it by hand.');
  return parseItunes(await r.json().catch(() => null));
}

export async function lookupLink(link: string): Promise<FoundWork | null> {
  const url = httpsUrl(link);
  if (!url) throw new HttpError(400, 'That doesn’t look like a link.');
  const r = await fetch(`https://api.song.link/v1-alpha.1/links?userCountry=US&url=${encodeURIComponent(url)}`, { headers: UA });
  if (r.status === 404 || r.status === 400) return null;
  if (!r.ok) throw new HttpError(502, 'Link lookup is unavailable right now. You can enter it by hand.');
  return parseOdesli(await r.json().catch(() => null));
}

export async function fetchArtwork(u: string): Promise<{ body: ArrayBuffer; type: string }> {
  if (!artworkHostOk(u)) throw new HttpError(400, 'That artwork can’t be imported. Upload it instead.');
  const r = await fetch(u, { headers: UA });
  const type = (r.headers.get('content-type') || '').split(';')[0]!.trim();
  if (!r.ok || !/^image\/(jpeg|png|webp)$/.test(type)) throw new HttpError(502, 'Couldn’t get the artwork. Upload it instead.');
  const body = await r.arrayBuffer();
  if (body.byteLength > 5 * 1024 * 1024) throw new HttpError(413, 'That artwork is too large. Upload it instead.');
  return { body, type };
}
