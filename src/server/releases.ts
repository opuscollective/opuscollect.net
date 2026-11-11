/**
 * Opus Music: build releases, credit the people who made them, and find collaborators.
 *
 * Rules:
 * - Only the owner edits a release. Published releases are public at /r/{id}.
 * - Crediting an Opus member sends them a request. The credit links to their profile and appears
 *   on their profile only after they confirm. They can decline, or remove themselves later.
 * - People not on Opus yet are credited by name (shown as plain text, never linked).
 * - Past releases are the same thing with `released` set, so a member's record is one list.
 */
import { GENRES } from '@/data/genres';
import { CREDIT_ROLES, LIMITS, MOODS, RELEASE_KINDS, RELEASE_LINK_KEYS, isCreditRole, roleLabel, type CreditRole, type ReleaseKind, type ReleaseLinkKey } from '@/data/music';
import { SPECIALTY_KEYS, type Specialty } from '@/data/specialties';
import { matchesKeywords, keywordTokens } from '@/lib/keywords';
import { rankByVibe, vibeMatch, type VibeMatch } from '@/lib/vibe';
import { isBlockedEitherWay } from './connections';
import { noticeMail, sendMail } from './email';
import { cleanUpload, cleanUrl, mediaUrl } from './profiles';
import { limit } from './ratelimit';
import type { SessionUser } from './session';
import { HttpError, audit, now, randomId, str } from './util';

const DAY = 86_400_000;
const parse = <T>(s: string | null | undefined, fallback: T): T => { try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; } };

export type CreditStatus = 'unlinked' | 'pending' | 'confirmed' | 'declined';

export interface Track { id: string; position: number; title: string }
export interface Credit {
  id: string; trackId: string | null; role: CreditRole | string; name: string; status: CreditStatus; note: string;
  userId: string | null; handle: string | null; photoKey: string | null;
}
export interface Release {
  id: string; ownerUserId: string; title: string; kind: ReleaseKind; releaseDate: string | null; released: boolean;
  description: string; coverKey: string | null; links: Partial<Record<ReleaseLinkKey, string>>; genres: string[]; moods: string[];
  status: 'draft' | 'published'; createdAt: number; updatedAt: number; publishedAt: number | null;
}
export interface ReleaseFull extends Release { tracks: Track[]; credits: Credit[]; ownerName: string; ownerHandle: string | null }

interface Row {
  id: string; owner_user_id: string; title: string; kind: ReleaseKind; release_date: string | null; released: number; description: string;
  cover_key: string | null; links: string; genres: string; moods: string; status: 'draft' | 'published'; created_at: number; updated_at: number; published_at: number | null;
}

const toRelease = (r: Row): Release => ({
  id: r.id, ownerUserId: r.owner_user_id, title: r.title, kind: r.kind, releaseDate: r.release_date, released: !!r.released,
  description: r.description, coverKey: r.cover_key, links: parse(r.links, {}), genres: parse(r.genres, []), moods: parse(r.moods, []),
  status: r.status, createdAt: r.created_at, updatedAt: r.updated_at, publishedAt: r.published_at,
});

/** "Single · 2026" style line for cards. */
export const releaseMeta = (r: Pick<Release, 'kind' | 'releaseDate' | 'released'>) =>
  [RELEASE_KINDS[r.kind] ?? r.kind, r.releaseDate ? (r.released ? r.releaseDate.slice(0, 4) : `Out ${formatDate(r.releaseDate)}`) : null].filter(Boolean).join(' · ');

export function formatDate(d: string) {
  const t = Date.parse(`${d}T12:00:00Z`);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : d;
}

/** Names shown as "by …": confirmed or unlinked primary artists, falling back to the owner. */
export const artistLine = (r: Pick<ReleaseFull, 'credits' | 'ownerName'>) => {
  const names = r.credits.filter((c) => c.role === 'primary-artist' && !c.trackId && c.status !== 'declined').map((c) => c.name);
  return names.length ? names.join(', ') : r.ownerName;
};

// ---------- reads ----------

async function hydrate(db: D1Database, row: Row): Promise<ReleaseFull> {
  const [tracks, credits, owner] = await db.batch([
    db.prepare('SELECT id, position, title FROM release_tracks WHERE release_id = ? ORDER BY position').bind(row.id),
    db.prepare(`SELECT c.id, c.track_id, c.role, c.name, c.status, c.note, c.user_id, p.handle, p.photo_key, p.status AS pstatus
                FROM release_credits c
                LEFT JOIN profiles p ON p.owner_user_id = c.user_id AND p.kind = 'musician'
                WHERE c.release_id = ? ORDER BY c.created_at`).bind(row.id),
    db.prepare("SELECT handle, display_name, status FROM profiles WHERE owner_user_id = ? AND kind = 'musician'").bind(row.owner_user_id),
  ]);
  const o = (owner!.results[0] as { handle: string; display_name: string; status: string } | undefined);
  return {
    ...toRelease(row),
    tracks: tracks!.results as unknown as Track[],
    credits: (credits!.results as { id: string; track_id: string | null; role: string; name: string; status: CreditStatus; note: string; user_id: string | null; handle: string | null; photo_key: string | null; pstatus: string | null }[])
      .map((c) => ({
        id: c.id, trackId: c.track_id, role: c.role, name: c.name, status: c.status, note: c.note, userId: c.user_id,
        // Link to a profile only while it's published.
        handle: c.pstatus === 'published' ? c.handle : null, photoKey: c.pstatus === 'published' ? c.photo_key : null,
      })),
    ownerName: o?.display_name ?? 'Opus member',
    ownerHandle: o?.status === 'published' ? o.handle : null,
  };
}

async function ownRelease(db: D1Database, user: SessionUser, id: string) {
  const row = await db.prepare('SELECT * FROM releases WHERE id = ?').bind(str(id, 40)).first<Row>();
  if (!row || row.owner_user_id !== user.id) throw new HttpError(404, 'Release not found.');
  return row;
}

export async function getReleaseForOwner(db: D1Database, user: SessionUser, id: string) {
  return hydrate(db, await ownRelease(db, user, id));
}

/**
 * A release page. Published releases are public. Drafts are visible to the owner and to anyone
 * credited on them, so a member can see what they're being asked to confirm.
 */
export async function getVisibleRelease(db: D1Database, id: string, viewerId: string | null) {
  const row = await db.prepare('SELECT * FROM releases WHERE id = ?').bind(str(id, 40)).first<Row>();
  if (!row) return null;
  const full = await hydrate(db, row);
  const isOwner = viewerId === row.owner_user_id;
  const myCredits = viewerId ? full.credits.filter((c) => c.userId === viewerId) : [];
  if (row.status !== 'published' && !isOwner && !myCredits.length) return null;
  return { release: full, isOwner, myCredits };
}

export interface ReleaseCard extends Release { trackCount: number; pending: number; artist: string }

export async function listMyReleases(db: D1Database, userId: string): Promise<ReleaseCard[]> {
  const { results } = await db.prepare(`
    SELECT r.*,
      (SELECT COUNT(*) FROM release_tracks t WHERE t.release_id = r.id) AS track_count,
      (SELECT COUNT(*) FROM release_credits c WHERE c.release_id = r.id AND c.status = 'pending') AS pending,
      (SELECT group_concat(c.name, ', ') FROM release_credits c WHERE c.release_id = r.id AND c.role = 'primary-artist' AND c.track_id IS NULL AND c.status <> 'declined') AS artist
    FROM releases r WHERE r.owner_user_id = ? ORDER BY r.updated_at DESC LIMIT 200`).bind(userId)
    .all<Row & { track_count: number; pending: number; artist: string | null }>();
  return results.map((r) => ({ ...toRelease(r), trackCount: r.track_count, pending: r.pending, artist: r.artist ?? '' }));
}

export interface CreditRequest { id: string; role: string; note: string; trackTitle: string | null; releaseId: string; releaseTitle: string; releaseStatus: string; coverKey: string | null; from: string; fromHandle: string | null; createdAt: number }

/** Credits waiting for this member to confirm. */
export async function myCreditRequests(db: D1Database, userId: string): Promise<CreditRequest[]> {
  const { results } = await db.prepare(`
    SELECT c.id, c.role, c.note, c.created_at, t.title AS track_title, r.id AS release_id, r.title AS release_title, r.status AS release_status, r.cover_key,
           p.display_name AS from_name, CASE WHEN p.status = 'published' THEN p.handle END AS from_handle
    FROM release_credits c
    JOIN releases r ON r.id = c.release_id
    LEFT JOIN release_tracks t ON t.id = c.track_id
    LEFT JOIN profiles p ON p.owner_user_id = r.owner_user_id AND p.kind = 'musician'
    WHERE c.user_id = ? AND c.status = 'pending'
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = r.owner_user_id) OR (b.blocker_id = r.owner_user_id AND b.blocked_id = ?))
    ORDER BY c.created_at DESC LIMIT 100`).bind(userId, userId, userId)
    .all<{ id: string; role: string; note: string; created_at: number; track_title: string | null; release_id: string; release_title: string; release_status: string; cover_key: string | null; from_name: string | null; from_handle: string | null }>();
  return results.map((r) => ({
    id: r.id, role: r.role, note: r.note, createdAt: r.created_at, trackTitle: r.track_title, releaseId: r.release_id, releaseTitle: r.release_title,
    releaseStatus: r.release_status, coverKey: r.cover_key, from: r.from_name ?? 'An Opus member', fromHandle: r.from_handle,
  }));
}

export interface ProfileReleaseItem { id: string; title: string; kind: ReleaseKind; releaseDate: string | null; released: boolean; coverKey: string | null; roles: string[]; own: boolean; artist: string }

/**
 * A member's record for their profile: releases they own and published, plus published releases
 * where they have a confirmed credit. One entry per release with all their roles on it.
 */
export async function profileReleases(db: D1Database, userId: string): Promise<ProfileReleaseItem[]> {
  const { results } = await db.prepare(`
    SELECT r.id, r.title, r.kind, r.release_date, r.released, r.cover_key, r.owner_user_id,
           (SELECT group_concat(DISTINCT c.role) FROM release_credits c WHERE c.release_id = r.id AND c.user_id = ? AND c.status = 'confirmed') AS roles,
           (SELECT group_concat(c.name, ', ') FROM release_credits c WHERE c.release_id = r.id AND c.role = 'primary-artist' AND c.track_id IS NULL AND c.status IN ('confirmed', 'unlinked', 'pending')) AS artist
    FROM releases r
    WHERE r.status = 'published'
      AND (r.owner_user_id = ? OR EXISTS (SELECT 1 FROM release_credits c WHERE c.release_id = r.id AND c.user_id = ? AND c.status = 'confirmed'))
    ORDER BY coalesce(r.release_date, '') DESC, r.published_at DESC LIMIT 100`).bind(userId, userId, userId)
    .all<{ id: string; title: string; kind: ReleaseKind; release_date: string | null; released: number; cover_key: string | null; owner_user_id: string; roles: string | null; artist: string | null }>();
  return results.map((r) => ({
    id: r.id, title: r.title, kind: r.kind, releaseDate: r.release_date, released: !!r.released, coverKey: r.cover_key,
    roles: (r.roles ? r.roles.split(',') : []).map(roleLabel), own: r.owner_user_id === userId, artist: r.artist ?? '',
  }));
}

// ---------- writes ----------

async function myMusicianProfile(db: D1Database, userId: string) {
  return db.prepare("SELECT id, handle, display_name, status FROM profiles WHERE owner_user_id = ? AND kind = 'musician'").bind(userId)
    .first<{ id: string; handle: string; display_name: string; status: string }>();
}

export async function createRelease(env: Env, user: SessionUser, body: { past?: unknown; title?: unknown }) {
  const db = env.DB;
  await limit(db, `release-create:${user.id}`, 30, DAY);
  const me = await myMusicianProfile(db, user.id);
  if (!me) throw new HttpError(403, 'Set up your Opus profile first, so your releases have a home.');
  const n = await db.prepare('SELECT COUNT(*) AS n FROM releases WHERE owner_user_id = ?').bind(user.id).first<{ n: number }>();
  if ((n?.n ?? 0) >= LIMITS.releases) throw new HttpError(400, `You can keep up to ${LIMITS.releases} releases.`);
  const past = body.past === true;
  const id = randomId();
  const t = now();
  const title = str(body.title, 120) || 'Untitled';
  // The person building the release is credited as its primary artist to start; they can change that.
  await db.batch([
    db.prepare('INSERT INTO releases (id, owner_user_id, title, released, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, user.id, title, past ? 1 : 0, t, t),
    db.prepare("INSERT INTO release_credits (id, release_id, role, user_id, name, status, created_by, created_at, responded_at) VALUES (?, ?, 'primary-artist', ?, ?, 'confirmed', ?, ?, ?)")
      .bind(randomId(), id, user.id, me.display_name, user.id, t, t),
  ]);
  await audit(db, user.id, 'release.created', { id, past });
  return { id };
}

const pickList = (v: unknown, allowed: readonly string[], max: number) =>
  [...new Set((Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string' && allowed.includes(x)))].slice(0, max);

export interface SaveReleaseInput {
  title?: unknown; kind?: unknown; releaseDate?: unknown; released?: unknown; description?: unknown;
  genres?: unknown; moods?: unknown; links?: unknown; tracks?: unknown;
}

export async function saveRelease(env: Env, user: SessionUser, id: string, body: SaveReleaseInput) {
  const db = env.DB;
  await limit(db, `release-save:${user.id}`, 120, 10 * 60_000);
  const row = await ownRelease(db, user, id);

  const title = str(body.title, 120);
  if (!title) throw new HttpError(400, 'Give the release a title.', 'title');
  const kind = typeof body.kind === 'string' && body.kind in RELEASE_KINDS ? (body.kind as ReleaseKind) : row.kind;
  const date = str(body.releaseDate, 10);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'Use a full date (year, month and day).', 'releaseDate');
  const released = body.released === true;
  if (released && date && date > new Date(now() + DAY).toISOString().slice(0, 10)) throw new HttpError(400, 'An already-released project needs a date in the past.', 'releaseDate');
  const description = str(body.description, 1500);
  const genres = pickList(body.genres, GENRES, LIMITS.genres);
  const moods = pickList(body.moods, MOODS, LIMITS.moods);
  const linksIn = (body.links && typeof body.links === 'object' ? body.links : {}) as Record<string, unknown>;
  const HOSTS: Record<ReleaseLinkKey, string[] | null> = {
    spotify: ['open.spotify.com', 'spotify.com', 'spotify.link'], appleMusic: ['music.apple.com'], youtube: ['youtube.com', 'youtu.be', 'music.youtube.com'],
    soundcloud: ['soundcloud.com', 'on.soundcloud.com'], other: null,
  };
  const links: Partial<Record<ReleaseLinkKey, string>> = {};
  for (const k of RELEASE_LINK_KEYS) { const u = cleanUrl(linksIn[k], HOSTS[k]); if (u) links[k] = u; }

  // Tracks: keep existing ids (their credits stay attached), add new ones, drop removed ones.
  const tracksIn = (Array.isArray(body.tracks) ? body.tracks : []).slice(0, LIMITS.tracks)
    .map((t) => { const o = (t ?? {}) as Record<string, unknown>; return { id: str(o.id, 40), title: str(o.title, 120) }; })
    .filter((t) => t.title);
  const existing = new Set(((await db.prepare('SELECT id FROM release_tracks WHERE release_id = ?').bind(row.id).all<{ id: string }>()).results).map((t) => t.id));
  const keep = new Set(tracksIn.filter((t) => existing.has(t.id)).map((t) => t.id));

  const t = now();
  const stmts: D1PreparedStatement[] = [
    db.prepare('UPDATE releases SET title=?, kind=?, release_date=?, released=?, description=?, genres=?, moods=?, links=?, updated_at=? WHERE id=?')
      .bind(title, kind, date || null, released ? 1 : 0, description, JSON.stringify(genres), JSON.stringify(moods), JSON.stringify(links), t, row.id),
  ];
  for (const old of existing) if (!keep.has(old)) stmts.push(db.prepare('DELETE FROM release_tracks WHERE id = ?').bind(old));
  tracksIn.forEach((tr, i) => {
    if (keep.has(tr.id)) stmts.push(db.prepare('UPDATE release_tracks SET position = ?, title = ? WHERE id = ?').bind(i + 1, tr.title, tr.id));
    else stmts.push(db.prepare('INSERT INTO release_tracks (id, release_id, position, title, created_at) VALUES (?, ?, ?, ?, ?)').bind(randomId(), row.id, i + 1, tr.title, t));
  });
  await db.batch(stmts);
  if (row.status === 'published') {
    const missing = missingForPublish({ title, released, releaseDate: date || null });
    if (missing.length) {
      await db.prepare("UPDATE releases SET status = 'draft' WHERE id = ?").bind(row.id).run();
      throw new HttpError(400, `Saved, and moved back to draft. To publish again, add: ${missing.join(', ')}.`);
    }
  }
  return getReleaseForOwner(db, user, row.id);
}

export function missingForPublish(r: Pick<Release, 'title' | 'released' | 'releaseDate'>) {
  const m: string[] = [];
  if (!r.title || r.title === 'Untitled') m.push('a title');
  if (r.released && !r.releaseDate) m.push('the date it came out');
  return m;
}

export async function setReleaseStatus(env: Env, user: SessionUser, id: string, publish: boolean) {
  const db = env.DB;
  const row = await ownRelease(db, user, id);
  if (publish) {
    const missing = missingForPublish(toRelease(row));
    if (missing.length) throw new HttpError(400, `To publish, add ${missing.join(' and ')}.`);
    const me = await myMusicianProfile(db, user.id);
    if (me?.status !== 'published') throw new HttpError(403, 'Publish your Opus profile first, so people can see who released this.');
  }
  await db.prepare('UPDATE releases SET status = ?, published_at = CASE WHEN ? = 1 THEN coalesce(published_at, ?) ELSE published_at END, updated_at = ? WHERE id = ?')
    .bind(publish ? 'published' : 'draft', publish ? 1 : 0, now(), now(), row.id).run();
  await audit(db, user.id, publish ? 'release.published' : 'release.unpublished', { id: row.id });
}

export async function deleteRelease(env: Env, user: SessionUser, id: string) {
  const row = await ownRelease(env.DB, user, id);
  await env.DB.prepare('DELETE FROM releases WHERE id = ?').bind(row.id).run();
  if (row.cover_key) await env.MEDIA.delete(row.cover_key);
  await audit(env.DB, user.id, 'release.deleted', { id: row.id });
}

export async function uploadCover(env: Env, user: SessionUser, id: string, request: Request) {
  const row = await ownRelease(env.DB, user, id);
  await limit(env.DB, `upload:${user.id}`, 30, 60 * 60_000);
  const { clean, ext, type } = await cleanUpload(request);
  const key = `r/${row.id}/cover-${randomId(12)}.${ext}`;
  await env.MEDIA.put(key, clean, { httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' } });
  await env.DB.prepare('UPDATE releases SET cover_key = ?, updated_at = ? WHERE id = ?').bind(key, now(), row.id).run();
  if (row.cover_key) await env.MEDIA.delete(row.cover_key);
  return mediaUrl(key)!;
}

export async function removeCover(env: Env, user: SessionUser, id: string) {
  const row = await ownRelease(env.DB, user, id);
  if (!row.cover_key) return;
  await env.DB.prepare('UPDATE releases SET cover_key = NULL, updated_at = ? WHERE id = ?').bind(now(), row.id).run();
  await env.MEDIA.delete(row.cover_key);
}

// ---------- credits ----------

export interface AddCreditInput { role?: unknown; trackId?: unknown; handle?: unknown; name?: unknown; note?: unknown }

export async function addCredit(env: Env, user: SessionUser, releaseId: string, body: AddCreditInput, origin: string) {
  const db = env.DB;
  const row = await ownRelease(db, user, releaseId);
  if (!isCreditRole(body.role)) throw new HttpError(400, 'Choose a role.', 'role');
  const role = body.role;
  const trackId = str(body.trackId, 40) || null;
  if (trackId && !(await db.prepare('SELECT 1 FROM release_tracks WHERE id = ? AND release_id = ?').bind(trackId, row.id).first())) throw new HttpError(400, 'That track isn’t on this release.');
  const n = await db.prepare('SELECT COUNT(*) AS n FROM release_credits WHERE release_id = ?').bind(row.id).first<{ n: number }>();
  if ((n?.n ?? 0) >= LIMITS.credits) throw new HttpError(400, `A release can hold up to ${LIMITS.credits} credits.`);
  const note = str(body.note, 400);
  const handle = str(body.handle, 40);
  const t = now();
  const id = randomId();

  if (!handle) {
    // Someone who isn't on Opus yet: a plain name, never linked to a profile.
    const name = str(body.name, 80);
    if (name.length < 2) throw new HttpError(400, 'Search for a member, or type the person’s name.', 'name');
    await insertCredit(db, { id, releaseId: row.id, trackId, role, userId: null, name, status: 'unlinked', note: '', by: user.id, t });
    return { id, status: 'unlinked' as const };
  }

  const target = await db.prepare("SELECT owner_user_id, display_name, status FROM profiles WHERE handle = ? AND kind = 'musician'").bind(handle)
    .first<{ owner_user_id: string; display_name: string; status: string }>();
  if (!target || target.status !== 'published') throw new HttpError(404, 'That member isn’t available.');
  if (target.owner_user_id === user.id) {
    await insertCredit(db, { id, releaseId: row.id, trackId, role, userId: user.id, name: target.display_name, status: 'confirmed', note: '', by: user.id, t });
    return { id, status: 'confirmed' as const };
  }
  if (!user.emailVerified) throw new HttpError(403, 'Confirm your email before crediting other members.');
  if (await isBlockedEitherWay(db, user.id, target.owner_user_id)) throw new HttpError(403, 'You can’t credit this member.');
  // A member who declined this release isn't asked again.
  const declined = await db.prepare("SELECT 1 FROM release_credits WHERE release_id = ? AND user_id = ? AND status = 'declined'").bind(row.id, target.owner_user_id).first();
  if (declined) throw new HttpError(409, `${target.display_name} declined a credit on this release, so they won’t be asked again.`);
  await limit(db, `credit-request:${user.id}`, 60, DAY);
  await insertCredit(db, { id, releaseId: row.id, trackId, role, userId: target.owner_user_id, name: target.display_name, status: 'pending', note, by: user.id, t });
  await audit(db, user.id, 'credit.requested', { id, release: row.id });

  // Let them know. Best effort: the request is waiting in their Music page either way.
  try {
    const to = await db.prepare('SELECT email FROM users WHERE id = ?').bind(target.owner_user_id).first<{ email: string }>();
    const me = await myMusicianProfile(db, user.id);
    const track = trackId ? (await db.prepare('SELECT title FROM release_tracks WHERE id = ?').bind(trackId).first<{ title: string }>())?.title : null;
    if (to) {
      await sendMail(env, noticeMail(to.email,
        `${me?.display_name ?? 'An Opus member'} credited you on “${row.title}”`,
        'You’ve been credited',
        `${me?.display_name ?? 'An Opus member'} credited you as ${CREDIT_ROLES[role].label} on ${track ? `“${track}” from ` : ''}“${row.title}”.${note ? ` They wrote: “${note}”` : ''} Confirm it to add the release to your Opus profile, or decline if it isn’t right.`,
        'Review credit', `${origin}/music`, 'Credits only appear on your profile after you confirm them.'));
    }
  } catch (e) { console.error('credit email', e); }
  return { id, status: 'pending' as const };
}

async function insertCredit(db: D1Database, c: { id: string; releaseId: string; trackId: string | null; role: string; userId: string | null; name: string; status: CreditStatus; note: string; by: string; t: number }) {
  try {
    await db.prepare('INSERT INTO release_credits (id, release_id, track_id, role, user_id, name, status, note, created_by, created_at, responded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(c.id, c.releaseId, c.trackId, c.role, c.userId, c.name, c.status, c.note, c.by, c.t, c.status === 'confirmed' ? c.t : null).run();
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new HttpError(409, `${c.name} already has that credit here.`);
    throw e;
  }
}

/** The owner removes a credit from their release. */
export async function removeCredit(env: Env, user: SessionUser, releaseId: string, creditId: unknown) {
  const row = await ownRelease(env.DB, user, releaseId);
  const r = await env.DB.prepare('DELETE FROM release_credits WHERE id = ? AND release_id = ?').bind(str(creditId, 40), row.id).run();
  if (!r.meta.changes) throw new HttpError(404, 'That credit is already gone.');
}

/** The credited member confirms, declines, or later removes themselves. */
export async function respondToCredit(env: Env, user: SessionUser, creditId: string, action: unknown) {
  const db = env.DB;
  const c = await db.prepare('SELECT id, status, user_id FROM release_credits WHERE id = ?').bind(str(creditId, 40)).first<{ id: string; status: CreditStatus; user_id: string | null }>();
  if (!c || c.user_id !== user.id) throw new HttpError(404, 'Credit not found.');
  if (action === 'confirm') {
    if (c.status !== 'pending' && c.status !== 'declined') throw new HttpError(400, 'This credit is already confirmed.');
  } else if (action === 'decline') {
    if (c.status === 'declined') return;
  } else throw new HttpError(400, 'Unknown action.');
  await db.prepare('UPDATE release_credits SET status = ?, responded_at = ? WHERE id = ?').bind(action === 'confirm' ? 'confirmed' : 'declined', now(), c.id).run();
  await audit(db, user.id, `credit.${action}`, { id: c.id });
}

// ---------- people ----------

/** Name/handle lookup for the credit picker. Published musician profiles only. */
export async function searchPeople(db: D1Database, user: SessionUser, q: string) {
  const term = str(q, 60).replace(/[%_]/g, '');
  if (term.length < 2) return [];
  const { results } = await db.prepare(`
    SELECT p.handle, p.display_name, p.primary_specialty, p.photo_key, p.owner_user_id
    FROM profiles p
    WHERE p.kind = 'musician' AND p.status = 'published'
      AND (p.display_name LIKE ? OR p.handle LIKE ?)
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = p.owner_user_id) OR (b.blocker_id = p.owner_user_id AND b.blocked_id = ?))
    ORDER BY (p.display_name LIKE ?) DESC, p.display_name LIMIT 8`)
    .bind(`%${term}%`, `${term}%`, user.id, user.id, `${term}%`)
    .all<{ handle: string; display_name: string; primary_specialty: string | null; photo_key: string | null; owner_user_id: string }>();
  return results.map((r) => ({ handle: r.handle, name: r.display_name, specialty: r.primary_specialty, photo: mediaUrl(r.photo_key), self: r.owner_user_id === user.id }));
}

export interface TalentResult {
  handle: string; name: string; specialty: string | null; placeId: string | null; locationVisibility: string; photo: string | null;
  openToCollab: boolean; verified: boolean; match: VibeMatch; releases: number; credited: boolean;
}

/**
 * "Find people for this song": members ranked by how well their sound matches the release's
 * genres and moods. Optionally narrowed to a role (via its specialty), a keyword, and members
 * who are open to collaborating.
 */
export async function findTalent(db: D1Database, user: SessionUser, releaseId: string, opts: { role?: string | null; q?: string | null; openOnly?: boolean }) {
  const release = await getReleaseForOwner(db, user, releaseId);
  const specialties: Specialty[] = opts.role && isCreditRole(opts.role) ? [...CREDIT_ROLES[opts.role].finds] : [];
  const specFilter = specialties.length ? `AND EXISTS (SELECT 1 FROM profile_specialties s WHERE s.profile_id = p.id AND s.specialty IN (SELECT value FROM json_each(?)))` : '';
  const binds: unknown[] = [JSON.stringify(release.genres), user.id, user.id, user.id];
  if (specialties.length) binds.push(JSON.stringify(specialties.filter((s) => (SPECIALTY_KEYS as readonly string[]).includes(s))));

  // Shortlist in SQL by genre overlap, then score genres and moods together.
  const { results: cands } = await db.prepare(`
    SELECT p.id, p.owner_user_id, p.handle, p.display_name, p.primary_specialty, p.place_id, p.location_visibility, p.photo_key, p.open_to_collab, p.verification, p.bio,
      (SELECT COUNT(*) FROM profile_genres g WHERE g.profile_id = p.id AND g.genre IN (SELECT value FROM json_each(?))) AS gm
    FROM profiles p
    WHERE p.kind = 'musician' AND p.status = 'published' AND p.owner_user_id <> ?
      ${opts.openOnly ? 'AND p.open_to_collab = 1' : ''}
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = p.owner_user_id) OR (b.blocker_id = p.owner_user_id AND b.blocked_id = ?))
      ${specFilter}
    ORDER BY gm DESC, p.updated_at DESC LIMIT 200`).bind(...binds)
    .all<{ id: string; owner_user_id: string; handle: string; display_name: string; primary_specialty: string | null; place_id: string | null; location_visibility: string | null; photo_key: string | null; open_to_collab: number; verification: string; bio: string; gm: number }>();
  if (!cands.length) return [];

  const ids = JSON.stringify(cands.map((c) => c.id));
  const users = JSON.stringify(cands.map((c) => c.owner_user_id));
  const [genres, specs, history] = await db.batch([
    db.prepare('SELECT profile_id, genre FROM profile_genres WHERE profile_id IN (SELECT value FROM json_each(?))').bind(ids),
    db.prepare('SELECT profile_id, specialty FROM profile_specialties WHERE profile_id IN (SELECT value FROM json_each(?))').bind(ids),
    // Moods of every published release each member owns or is confirmed on.
    db.prepare(`SELECT u.value AS user_id, r.moods FROM json_each(?) u
                JOIN releases r ON r.status = 'published' AND (r.owner_user_id = u.value OR EXISTS (
                  SELECT 1 FROM release_credits c WHERE c.release_id = r.id AND c.user_id = u.value AND c.status = 'confirmed'))`).bind(users),
  ]);
  const byProfile = <T extends { profile_id: string }>(rows: T[], pick: (r: T) => string) => {
    const m = new Map<string, string[]>();
    for (const r of rows) m.set(r.profile_id, [...(m.get(r.profile_id) ?? []), pick(r)]);
    return m;
  };
  const genreMap = byProfile(genres!.results as { profile_id: string; genre: string }[], (r) => r.genre);
  const specMap = byProfile(specs!.results as { profile_id: string; specialty: string }[], (r) => r.specialty);
  const moodMap = new Map<string, string[]>();
  const relCount = new Map<string, number>();
  for (const h of history!.results as { user_id: string; moods: string }[]) {
    moodMap.set(h.user_id, [...(moodMap.get(h.user_id) ?? []), ...parse<string[]>(h.moods, [])]);
    relCount.set(h.user_id, (relCount.get(h.user_id) ?? 0) + 1);
  }
  const credited = new Set(release.credits.filter((c) => c.userId && c.status !== 'declined').map((c) => c.userId));
  const tokens = keywordTokens(opts.q ?? '');

  const items = cands
    .filter((c) => !tokens.length || matchesKeywords([c.display_name, c.handle, c.bio, ...(genreMap.get(c.id) ?? []), ...(specMap.get(c.id) ?? [])].join(' '), tokens))
    .map((c) => ({
      handle: c.handle, name: c.display_name, specialty: c.primary_specialty, placeId: c.place_id, locationVisibility: c.location_visibility ?? 'city',
      photo: mediaUrl(c.photo_key), openToCollab: !!c.open_to_collab, verified: c.verification === 'verified',
      match: vibeMatch(release, { genres: genreMap.get(c.id) ?? [], moods: moodMap.get(c.owner_user_id) ?? [] }),
      releases: relCount.get(c.owner_user_id) ?? 0, credited: credited.has(c.owner_user_id),
    }));
  return rankByVibe(items).slice(0, 24) satisfies TalentResult[];
}
