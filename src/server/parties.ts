/**
 * Listening parties on the server: scheduling, private files, reminders, and what World lists.
 *
 * Rules enforced here, not in the pages:
 * - A party belongs to one work in the host's own Opus Works. Only the host changes it.
 * - Audio and video are private R2 objects (keys under party/, which /media never serves). A listener
 *   can fetch a track only while the party is live, only up to the track that is playing, and only
 *   when signed in and not removed from the room. The host can always hear their own files.
 * - Nothing here invents numbers: listener counts come from the room, and only for live parties.
 */
import { HttpError, audit, now, randomId, str } from './util';
import { limit } from './ratelimit';
import { getMyProfile, mediaUrl } from './profiles';
import type { SessionUser } from './session';
import { PLACE_BY_ID } from '@/data/places';
import { formatSlot, isTimeZone, localDay, tzAbbr } from '@/lib/booking-time';
import { AUDIO_TYPES, LISTED_AHEAD_MS, LOBBY_OPENS_MS, MAX_AUDIO_BYTES, MAX_TRACKS, MAX_VISUAL_BYTES, SOON_MS, VISUAL_TYPES, startsLabel } from '@/lib/party';
import type { FutureItem } from '@/lib/future';

export type PartyDbStatus = 'scheduled' | 'live' | 'ended' | 'canceled';

interface Row {
  id: string; host_user_id: string; release_id: string; place_id: string | null; starts_at: number; timezone: string; note: string;
  status: PartyDbStatus; current_track: number; started_at: number | null; ended_at: number | null; peak_listeners: number; created_at: number;
  r_title: string; r_kind: string; r_cover: string | null; r_status: string; r_date: string | null;
  h_name: string | null; h_handle: string | null; h_photo: string | null; h_status: string | null;
}

export interface PartyView {
  id: string; href: string; status: PartyDbStatus; startsAt: number; timezone: string; when: string; day: string; note: string;
  place: { id: string; name: string; lat: number; lng: number } | null;
  currentTrack: number; startedAt: number | null; endedAt: number | null; peak: number;
  host: { userId: string; name: string; handle: string | null; photo: string | null; published: boolean };
  release: { id: string; title: string; kind: string; cover: string | null; published: boolean; releaseDate: string | null };
}

export interface PartyTrack {
  id: string; position: number; title: string; note: string; hasAudio: boolean; durationMs: number; audioBytes: number; hasVisual: boolean;
}

const SELECT = `SELECT pa.*, r.title AS r_title, r.kind AS r_kind, r.cover_key AS r_cover, r.status AS r_status, r.release_date AS r_date,
    p.display_name AS h_name, p.handle AS h_handle, p.photo_key AS h_photo, p.status AS h_status
  FROM parties pa JOIN releases r ON r.id = pa.release_id
  LEFT JOIN profiles p ON p.owner_user_id = pa.host_user_id AND p.kind = 'musician'`;

function view(r: Row): PartyView {
  const pl = r.place_id ? PLACE_BY_ID.get(r.place_id) : null;
  const published = r.h_status === 'published';
  return {
    id: r.id, href: `/party/${r.id}`, status: r.status, startsAt: r.starts_at, timezone: r.timezone,
    when: `${formatSlot(r.starts_at, r.timezone)} ${tzAbbr(r.starts_at, r.timezone)}`, day: localDay(r.starts_at, r.timezone), note: r.note,
    place: pl ? { id: pl.id, name: pl.name, lat: pl.lat, lng: pl.lng } : null,
    currentTrack: r.current_track, startedAt: r.started_at, endedAt: r.ended_at, peak: r.peak_listeners,
    host: { userId: r.host_user_id, name: r.h_name ?? 'Opus member', handle: published ? r.h_handle : null, photo: published ? mediaUrl(r.h_photo) : null, published },
    release: { id: r.release_id, title: r.r_title, kind: r.r_kind, cover: mediaUrl(r.r_cover), published: r.r_status === 'published', releaseDate: r.r_date },
  };
}

export async function getParty(db: D1Database, id: string): Promise<PartyView | null> {
  const r = await db.prepare(`${SELECT} WHERE pa.id = ?`).bind(str(id, 40)).first<Row>();
  return r ? view(r) : null;
}

interface TrackRow { id: string; position: number; title: string; note: string; audio_key: string | null; audio_type: string | null; audio_bytes: number | null; duration_ms: number | null; visual_key: string | null; visual_type: string | null }

const trackRows = async (db: D1Database, partyId: string) =>
  (await db.prepare('SELECT * FROM party_tracks WHERE party_id = ? ORDER BY position, created_at').bind(partyId).all<TrackRow>()).results;

export async function listTracks(db: D1Database, partyId: string): Promise<PartyTrack[]> {
  return (await trackRows(db, partyId)).map((t) => ({
    id: t.id, position: t.position, title: t.title, note: t.note, hasAudio: !!t.audio_key, durationMs: t.duration_ms ?? 0, audioBytes: t.audio_bytes ?? 0, hasVisual: !!t.visual_key,
  }));
}

/** A party page opens for anyone with the link, unless it was canceled or the host's profile is unpublished (then only the host). */
export const canView = (p: PartyView, viewerId: string | null) => viewerId === p.host.userId || (p.status !== 'canceled' && p.host.published);

/** The room (lobby and chat) opens a little before the start time and closes when the party ends. */
export const roomOpen = (p: Pick<PartyView, 'status' | 'startsAt'>, t = now()) =>
  p.status === 'live' || (p.status === 'scheduled' && t >= p.startsAt - LOBBY_OPENS_MS);

async function ownParty(db: D1Database, user: SessionUser, id: string) {
  const p = await getParty(db, id);
  if (!p || p.host.userId !== user.id) throw new HttpError(404, 'Party not found.');
  return p;
}

function parseStart(body: Record<string, unknown>, t: number) {
  const startsAt = Number(body.startsAt);
  const timezone = str(body.timezone, 60);
  if (!Number.isFinite(startsAt)) throw new HttpError(400, 'Choose a date and time.', 'date');
  if (!isTimeZone(timezone)) throw new HttpError(400, 'Choose a time zone.', 'timezone');
  if (startsAt < t - 5 * 60_000) throw new HttpError(400, 'That time has already passed.', 'date');
  if (startsAt > t + 120 * 86_400_000) throw new HttpError(400, 'Pick a date in the next four months.', 'date');
  return { startsAt: Math.round(startsAt), timezone };
}

/** The city a party's pin sits on: the host's metro, and only when their own profile shows a city. */
function pinPlace(profile: { placeId: string | null; locationVisibility: string; showOnMap: boolean }, wanted: boolean) {
  if (!wanted || !profile.placeId || !profile.showOnMap || !['city', 'metro'].includes(profile.locationVisibility)) return null;
  return PLACE_BY_ID.get(profile.placeId)?.metroId ?? null;
}

export async function createParty(env: Env, user: SessionUser, body: Record<string, unknown>) {
  const db = env.DB;
  if (!user.emailVerified) throw new HttpError(403, 'Confirm your email before hosting a listening party.');
  const profile = await getMyProfile(db, user.id);
  if (!profile || profile.status !== 'published') throw new HttpError(400, 'Publish your profile first. A party shows who is hosting it.');
  const rel = await db.prepare('SELECT id, title, owner_user_id FROM releases WHERE id = ?').bind(str(body.releaseId, 40)).first<{ id: string; title: string; owner_user_id: string }>();
  if (!rel || rel.owner_user_id !== user.id) throw new HttpError(400, 'Choose one of your works.', 'releaseId');
  const t = now();
  const { startsAt, timezone } = parseStart(body, t);
  const active = await db.prepare("SELECT id FROM parties WHERE release_id = ? AND status IN ('scheduled', 'live')").bind(rel.id).first<{ id: string }>();
  if (active) throw new HttpError(409, 'This work already has a party scheduled.', 'releaseId');
  await limit(db, `party-create:${user.id}`, 10, 86_400_000);

  const id = randomId(9);
  const titles = (await db.prepare('SELECT title FROM release_tracks WHERE release_id = ? ORDER BY position').bind(rel.id).all<{ title: string }>()).results.map((r) => r.title).slice(0, MAX_TRACKS);
  if (!titles.length) titles.push(rel.title);
  await db.batch([
    db.prepare(`INSERT INTO parties (id, host_user_id, release_id, place_id, starts_at, timezone, note, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`).bind(id, user.id, rel.id, pinPlace(profile, body.showOnMap !== false), startsAt, timezone, str(body.note, 280), t, t),
    ...titles.map((title, i) => db.prepare('INSERT INTO party_tracks (id, party_id, position, title, created_at) VALUES (?, ?, ?, ?, ?)').bind(randomId(9), id, i + 1, title, t)),
  ]);
  await audit(db, user.id, 'party.create', { id, release: rel.id });
  return { id, href: `/party/${id}/manage` };
}

/** Change the time, the note, the pin, and each track's note. Only before the party starts. */
export async function updateParty(env: Env, user: SessionUser, id: string, body: Record<string, unknown>) {
  const db = env.DB;
  const p = await ownParty(db, user, id);
  if (p.status !== 'scheduled') throw new HttpError(409, 'This party has already started.');
  const t = now();
  const { startsAt, timezone } = parseStart(body, t);
  const profile = await getMyProfile(db, user.id);
  const stmts = [db.prepare('UPDATE parties SET starts_at = ?, timezone = ?, note = ?, place_id = ?, updated_at = ? WHERE id = ?')
    .bind(startsAt, timezone, str(body.note, 280), profile ? pinPlace(profile, body.showOnMap !== false) : null, t, p.id)];
  const notes = body.notes && typeof body.notes === 'object' ? (body.notes as Record<string, unknown>) : {};
  for (const [trackId, note] of Object.entries(notes).slice(0, MAX_TRACKS))
    stmts.push(db.prepare('UPDATE party_tracks SET note = ? WHERE id = ? AND party_id = ?').bind(str(note, 280), str(trackId, 40), p.id));
  await db.batch(stmts);
  return { ok: true };
}

/** Deletes every private file of a party. Called on cancel, and by the room a day after the party ends. */
export async function deletePartyMedia(env: Env, partyId: string) {
  const rows = await trackRows(env.DB, partyId);
  const keys = rows.flatMap((t) => [t.audio_key, t.visual_key]).filter((k): k is string => !!k);
  if (keys.length) await env.MEDIA.delete(keys);
  await env.DB.prepare('UPDATE party_tracks SET audio_key = NULL, visual_key = NULL WHERE party_id = ?').bind(partyId).run();
}

export async function cancelParty(env: Env, user: SessionUser, id: string) {
  const p = await ownParty(env.DB, user, id);
  if (p.status !== 'scheduled') throw new HttpError(409, 'This party has already started. End it from the room.');
  await env.DB.prepare("UPDATE parties SET status = 'canceled', updated_at = ? WHERE id = ?").bind(now(), p.id).run();
  await deletePartyMedia(env, p.id);
  await audit(env.DB, user.id, 'party.cancel', { id: p.id });
  return { ok: true };
}

/** Removes a track from the party (not from the work). At least one track stays. */
export async function removeTrack(env: Env, user: SessionUser, id: string, trackId: string) {
  const p = await ownParty(env.DB, user, id);
  if (p.status !== 'scheduled') throw new HttpError(409, 'This party has already started.');
  const rows = await trackRows(env.DB, p.id);
  const tr = rows.find((x) => x.id === trackId);
  if (!tr) throw new HttpError(404, 'Track not found.');
  if (rows.length === 1) throw new HttpError(400, 'A party needs at least one track.');
  const keys = [tr.audio_key, tr.visual_key].filter((k): k is string => !!k);
  if (keys.length) await env.MEDIA.delete(keys);
  await env.DB.prepare('DELETE FROM party_tracks WHERE id = ?').bind(tr.id).run();
  return { ok: true };
}

/**
 * Stores a track's audio (or its optional video) privately. The body is the file itself, streamed
 * straight into R2. The host says they hold the rights by sending x-opus-rights: 1.
 */
export async function uploadPartyMedia(env: Env, user: SessionUser, id: string, trackId: string, kind: 'audio' | 'visual', request: Request) {
  const db = env.DB;
  const p = await ownParty(db, user, id);
  if (p.status !== 'scheduled') throw new HttpError(409, 'This party has already started.');
  const tr = (await trackRows(db, p.id)).find((x) => x.id === trackId);
  if (!tr) throw new HttpError(404, 'Track not found.');
  if (request.headers.get('x-opus-rights') !== '1') throw new HttpError(400, 'Confirm that this is your music to share.');
  const type = (request.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  const ext = (kind === 'audio' ? AUDIO_TYPES : VISUAL_TYPES)[type];
  if (!ext) throw new HttpError(415, kind === 'audio' ? 'Upload an MP3, M4A, WAV, FLAC or OGG file.' : 'Upload an MP4, MOV or WebM video.');
  const bytes = Number(request.headers.get('content-length') || 0);
  const max = kind === 'audio' ? MAX_AUDIO_BYTES : MAX_VISUAL_BYTES;
  if (!bytes) throw new HttpError(411, 'That file looks empty.');
  if (bytes > max) throw new HttpError(413, `That file is too large. Keep it under ${Math.floor(max / 1048576)} MB.`);
  if (!request.body) throw new HttpError(400, 'That file looks empty.');
  await limit(db, `party-upload:${user.id}`, 80, 86_400_000);

  const key = `party/${p.id}/${tr.id}-${kind}-${randomId(12)}.${ext}`;
  await env.MEDIA.put(key, request.body as never, { httpMetadata: { contentType: type } }).then(() => undefined);
  const old = kind === 'audio' ? tr.audio_key : tr.visual_key;
  if (kind === 'audio') {
    const d = Number(request.headers.get('x-opus-duration-ms'));
    const duration = Number.isFinite(d) && d >= 1000 && d <= 3 * 3_600_000 ? Math.round(d) : null;
    if (!duration) { await env.MEDIA.delete(key); throw new HttpError(400, 'We couldn’t read that file’s length. Try an MP3 or M4A.'); }
    await db.prepare('UPDATE party_tracks SET audio_key = ?, audio_type = ?, audio_bytes = ?, duration_ms = ? WHERE id = ?').bind(key, type, bytes, duration, tr.id).run();
  } else {
    await db.prepare('UPDATE party_tracks SET visual_key = ?, visual_type = ? WHERE id = ?').bind(key, type, tr.id).run();
  }
  if (old) await env.MEDIA.delete(old);
  return { ok: true };
}

export async function removePartyVisual(env: Env, user: SessionUser, id: string, trackId: string) {
  const p = await ownParty(env.DB, user, id);
  const tr = (await trackRows(env.DB, p.id)).find((x) => x.id === trackId);
  if (!tr?.visual_key) return { ok: true };
  await env.MEDIA.delete(tr.visual_key);
  await env.DB.prepare('UPDATE party_tracks SET visual_key = NULL, visual_type = NULL WHERE id = ?').bind(tr.id).run();
  return { ok: true };
}

/** Serves one private file with byte ranges, so a late listener can start in the middle. Never cached, never offered as a download. */
export async function servePartyMedia(env: Env, user: SessionUser | null, id: string, trackId: string, kind: 'audio' | 'visual', request: Request): Promise<Response> {
  const deny = (status: number, msg: string) => new Response(msg, { status, headers: { 'cache-control': 'no-store' } });
  if (!user) return deny(401, 'Sign in to listen.');
  const p = await getParty(env.DB, id);
  if (!p) return deny(404, 'Not found');
  const rows = await trackRows(env.DB, p.id);
  const index = rows.findIndex((x) => x.id === trackId);
  const tr = rows[index];
  const key = tr && (kind === 'audio' ? tr.audio_key : tr.visual_key);
  if (!tr || !key) return deny(404, 'Not found');
  if (user.id !== p.host.userId) {
    if (p.status !== 'live' || index > p.currentTrack) return deny(403, 'This only plays during the party.');
    const out = await env.DB.prepare('SELECT 1 AS x FROM party_removals WHERE party_id = ? AND user_id = ?').bind(p.id, user.id).first();
    if (out) return deny(403, 'You were removed from this party.');
  }
  const size = (kind === 'audio' ? tr.audio_bytes : null) ?? (await env.MEDIA.head(key))?.size ?? 0;
  const m = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '');
  let start = 0, end = size - 1, partial = false;
  if (m && size && (m[1] || m[2])) {
    partial = true;
    if (m[1]) { start = Number(m[1]); if (m[2]) end = Math.min(end, Number(m[2])); }
    else { start = Math.max(0, size - Number(m[2])); }
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}`, 'cache-control': 'no-store' } });
  }
  const obj = await env.MEDIA.get(key, partial ? { range: { offset: start, length: end - start + 1 } } : undefined);
  if (!obj) return deny(404, 'Not found');
  const headers = new Headers({
    'content-type': (kind === 'audio' ? tr.audio_type : tr.visual_type) ?? 'application/octet-stream',
    'accept-ranges': 'bytes', 'cache-control': 'private, no-store', 'content-disposition': 'inline', 'x-content-type-options': 'nosniff',
    'content-length': String(partial ? end - start + 1 : size || obj.size),
  });
  if (partial) headers.set('content-range', `bytes ${start}-${end}/${size}`);
  return new Response(obj.body as unknown as ReadableStream, { status: partial ? 206 : 200, headers });
}

// ---------- Reminders and Future ----------

export async function setReminder(env: Env, user: SessionUser, id: string, on: boolean) {
  const p = await getParty(env.DB, id);
  if (!p || !canView(p, user.id) || p.status === 'canceled') throw new HttpError(404, 'Party not found.');
  if (on) {
    if (p.status === 'ended') throw new HttpError(409, 'This party has ended.');
    await limit(env.DB, `party-remind:${user.id}`, 100, 86_400_000);
    await env.DB.prepare('INSERT OR IGNORE INTO party_reminders (party_id, user_id, created_at) VALUES (?, ?, ?)').bind(p.id, user.id, now()).run();
  } else await env.DB.prepare('DELETE FROM party_reminders WHERE party_id = ? AND user_id = ?').bind(p.id, user.id).run();
  return { ok: true, reminded: on };
}

export const hasReminder = async (db: D1Database, userId: string, partyId: string) =>
  !!(await db.prepare('SELECT 1 AS x FROM party_reminders WHERE party_id = ? AND user_id = ?').bind(partyId, userId).first());

/** Parties in a member's Future: the ones they host and the ones they asked to be reminded about. */
export async function partyFutureItems(db: D1Database, userId: string, t = now()): Promise<FutureItem[]> {
  try {
    const { results } = await db.prepare(`${SELECT} WHERE pa.status IN ('scheduled', 'live') AND pa.starts_at > ?
        AND (pa.host_user_id = ?2 OR EXISTS (SELECT 1 FROM party_reminders pr WHERE pr.party_id = pa.id AND pr.user_id = ?2))
      ORDER BY pa.starts_at LIMIT 50`).bind(t - 12 * 3_600_000, userId).all<Row>();
    return results.map(view).filter((p) => p.host.userId === userId || p.host.published).map((p) => ({
      id: `party-${p.id}`, kind: 'event' as const, title: `${p.release.title} · Listening party`, detail: `Live on Opus · Hosted by ${p.host.name}`,
      when: p.when, day: p.day, at: p.startsAt, image: p.release.cover, href: p.href,
      status: p.status === 'live' ? 'Live now' : p.host.userId === userId ? 'Hosting' : 'Reminder set', tone: 'role' as const,
    }));
  } catch { return []; } // migration 0015 not applied yet
}

// ---------- World ----------

export interface PartyListing {
  id: string; href: string; title: string; host: string; hostPhoto: string | null; cover: string | null; live: boolean; soon: boolean;
  startsAt: number; when: string; label: string; city: string | null; lat: number | null; lng: number | null;
  /** People in the room right now. Only present for live parties, read from the room. */
  listening?: number;
}

/** Live parties and the ones coming up, for World and the work page. Real parties only. */
export async function listPublicParties(env: Env, t = now()): Promise<PartyListing[]> {
  let rows: Row[] = [];
  try {
    rows = (await env.DB.prepare(`${SELECT} WHERE (pa.status = 'live' OR (pa.status = 'scheduled' AND pa.starts_at > ? AND pa.starts_at < ?)) AND p.status = 'published'
      ORDER BY (pa.status = 'live') DESC, pa.starts_at LIMIT 40`).bind(t - 3_600_000, t + LISTED_AHEAD_MS).all<Row>()).results;
  } catch { return []; } // migration 0015 not applied yet
  const out: PartyListing[] = rows.map(view).map((p) => {
    const live = p.status === 'live';
    return {
      id: p.id, href: p.href, title: p.release.title, host: p.host.name, hostPhoto: p.host.photo, cover: p.release.cover, live, soon: !live && p.startsAt - t < SOON_MS,
      startsAt: p.startsAt, when: p.when, label: startsLabel(p.startsAt, live, t, p.when), city: p.place?.name ?? null, lat: p.place?.lat ?? null, lng: p.place?.lng ?? null,
    };
  });
  await Promise.all(out.filter((p) => p.live).slice(0, 12).map(async (p) => {
    try {
      const r = await partyRoom(env, p.id).fetch('https://room/party/count', { headers: { 'x-opus-party': p.id } });
      if (r.ok) p.listening = ((await r.json()) as { n: number }).n;
    } catch { /* the count is optional */ }
  }));
  return out;
}

export async function activePartyForRelease(db: D1Database, releaseId: string): Promise<PartyView | null> {
  try {
    const r = await db.prepare(`${SELECT} WHERE pa.release_id = ? AND pa.status IN ('scheduled', 'live') ORDER BY pa.starts_at LIMIT 1`).bind(releaseId).first<Row>();
    return r ? view(r) : null;
  } catch { return null; }
}

export async function myParties(db: D1Database, userId: string): Promise<PartyView[]> {
  try {
    return (await db.prepare(`${SELECT} WHERE pa.host_user_id = ? AND pa.status <> 'canceled' ORDER BY pa.starts_at DESC LIMIT 30`).bind(userId).all<Row>()).results.map(view);
  } catch { return []; }
}

/** Each party has its own room: an instance of the chat Durable Object class, named party:<id>. */
export const partyRoom = (env: Env, id: string) => env.CHAT.get(env.CHAT.idFromName(`party:${id}`));
