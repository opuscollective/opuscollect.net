/** Pure parsing for work lookups (no imports, so tests can run it directly). See works-lookup.ts. */
export interface FoundWork {
  title: string; artist: string; album: string; kind: 'single' | 'ep' | 'album';
  /** YYYY-MM-DD, or '' when unknown. */
  releaseDate: string; genre: string; artwork: string; source: 'apple' | 'link';
  links: { spotify?: string; appleMusic?: string; youtube?: string; soundcloud?: string; other?: string };
}

const clean = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const httpsUrl = (v: unknown) => { try { const u = new URL(String(v)); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };

/** iTunes search result items → suggestions. Artwork is asked at 600px. */
export function parseItunes(json: unknown): FoundWork[] {
  const results = (json as { results?: unknown[] } | null)?.results;
  if (!Array.isArray(results)) return [];
  const out: FoundWork[] = [];
  for (const r of results as Record<string, unknown>[]) {
    const title = clean(r.trackName, 120), artist = clean(r.artistName, 80);
    if (!title || !artist) continue;
    const album = clean(r.collectionName, 120);
    const art = httpsUrl(r.artworkUrl100).replace(/\/\d+x\d+(bb)?\.(jpg|png|webp)$/i, '/600x600bb.jpg');
    const date = /^\d{4}-\d{2}-\d{2}/.exec(clean(r.releaseDate, 30))?.[0] ?? '';
    const tracks = Number(r.trackCount) || 0;
    out.push({
      title, artist, album,
      kind: tracks > 6 ? 'album' : tracks > 1 && / - EP$/i.test(album) ? 'ep' : 'single',
      releaseDate: date, genre: clean(r.primaryGenreName, 40), artwork: art, source: 'apple',
      links: { appleMusic: httpsUrl(r.trackViewUrl) || undefined },
    });
  }
  return out;
}

/** Odesli /links response → one suggestion, or null when it knows nothing useful. */
export function parseOdesli(json: unknown): FoundWork | null {
  const j = json as { entityUniqueId?: string; entitiesByUniqueId?: Record<string, Record<string, unknown>>; linksByPlatform?: Record<string, { url?: string }> } | null;
  if (!j?.entitiesByUniqueId) return null;
  const ents = Object.values(j.entitiesByUniqueId);
  const main = (j.entityUniqueId && j.entitiesByUniqueId[j.entityUniqueId]) || ents.find((e) => e.title && e.artistName) || ents[0];
  const title = clean(main?.title, 120), artist = clean(main?.artistName, 80);
  if (!title) return null;
  const thumb = httpsUrl(main?.thumbnailUrl) || httpsUrl(ents.find((e) => e.thumbnailUrl)?.thumbnailUrl);
  const L = j.linksByPlatform ?? {};
  const u = (k: string) => httpsUrl(L[k]?.url) || undefined;
  return {
    title, artist, album: '', kind: main?.type === 'album' ? 'album' : 'single', releaseDate: '', genre: '', artwork: thumb, source: 'link',
    links: { spotify: u('spotify'), appleMusic: u('appleMusic'), youtube: u('youtubeMusic') ?? u('youtube'), soundcloud: u('soundcloud') },
  };
}


/** Artwork may only come from the cover-art hosts the lookups return. */
const ART_HOSTS = ['mzstatic.com', 'scdn.co', 'ytimg.com', 'sndcdn.com', 'dzcdn.net', 'tidal.com', 'googleusercontent.com', 'audiomack.com'];
export const artworkHostOk = (u: string) => { try { const h = new URL(u).hostname; return new URL(u).protocol === 'https:' && ART_HOSTS.some((d) => h === d || h.endsWith('.' + d)); } catch { return false; } };

