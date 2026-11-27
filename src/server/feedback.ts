/**
 * Feedback (the Discord's Feedback Wednesdays, inside Opus, open all week).
 * A member posts a track as a link; other members leave written notes. Nothing is hosted and nothing is scored:
 * the only number shown is how many notes a track has. Members only, like the Discord it comes from.
 * A note on someone else's track counts toward the giver's level (once per track, see src/server/progress.ts).
 */
import { FEEDBACK } from '@/lib/feedback';
import { mediaUrl } from './profiles';
import { limit } from './ratelimit';
import type { SessionUser } from './session';
import { HttpError, now, randomId, str } from './util';
import { artworkHostOk } from './works-parse';

let ready: Promise<boolean> | null = null;
/** Whether migration 0018 has reached this database. Previews and production get it only with Bogo's OK. */
export function feedbackReady(db: D1Database): Promise<boolean> {
  ready ??= db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'feedback_notes'").first().then((r) => !!r).catch(() => false);
  return ready.then((ok) => { if (!ok) ready = null; return ok; });
}

export interface FeedbackMember { handle: string; name: string; photo: string | null; verified: boolean }
export interface FeedbackTrack {
  id: string; url: string; host: string; title: string; artist: string; artwork: string; ask: string; at: number;
  by: FeedbackMember; notes: number; mine: boolean; /** The viewer already left a note. */ given: boolean;
}
export interface FeedbackNote { id: string; body: string; at: number; by: FeedbackMember; mine: boolean }

interface MemberRow { handle: string | null; display_name: string | null; photo_key: string | null; verification: string | null }
const MEMBER_COLS = 'p.handle, p.display_name, p.photo_key, p.verification';
const MEMBER_JOIN = (uid: string) => `LEFT JOIN profiles p ON p.owner_user_id = ${uid} AND p.kind = 'musician' AND p.status = 'published'`;
// A member who unpublished keeps their words, without a link.
const member = (r: MemberRow): FeedbackMember => ({ handle: r.handle ?? '', name: r.handle ? r.display_name ?? 'Opus member' : 'Opus member', photo: r.handle ? mediaUrl(r.photo_key) : null, verified: r.verification === 'verified' });
const NOT_BLOCKED = (uid: string) => `NOT EXISTS (SELECT 1 FROM blocks k WHERE (k.blocker_id = ?1 AND k.blocked_id = ${uid}) OR (k.blocker_id = ${uid} AND k.blocked_id = ?1))`;
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const httpsUrl = (v: unknown) => { try { const u = new URL(String(v).trim()); return u.protocol === 'https:' && u.hostname.includes('.') ? u.href.slice(0, 500) : ''; } catch { return ''; } };
const line = (v: unknown, n: number) => str(v, n * 2).replace(/\s+/g, ' ').trim().slice(0, n);

type TrackRow = MemberRow & { id: string; user_id: string; url: string; title: string; artist: string; artwork: string; ask: string; created_at: number; notes: number; given: number };
const track = (r: TrackRow, viewer: string): FeedbackTrack => ({
  id: r.id, url: r.url, host: hostOf(r.url), title: r.title, artist: r.artist, artwork: r.artwork, ask: r.ask, at: r.created_at,
  by: member(r), notes: r.notes, mine: r.user_id === viewer, given: !!r.given,
});
const TRACK_SELECT = `SELECT t.id, t.user_id, t.url, t.title, t.artist, t.artwork, t.ask, t.created_at, ${MEMBER_COLS},
    (SELECT COUNT(*) FROM feedback_notes n WHERE n.track_id = t.id AND n.status = 'visible') AS notes,
    EXISTS (SELECT 1 FROM feedback_notes n WHERE n.track_id = t.id AND n.status = 'visible' AND n.user_id = ?1) AS given
  FROM feedback_tracks t ${MEMBER_JOIN('t.user_id')}`;

/** The feed, newest first. */
export async function listTracks(db: D1Database, viewer: string, max = 60): Promise<FeedbackTrack[]> {
  const { results } = await db.prepare(`${TRACK_SELECT} WHERE t.status = 'open' AND ${NOT_BLOCKED('t.user_id')} ORDER BY t.created_at DESC LIMIT ${Math.min(100, Math.max(1, max | 0))}`)
    .bind(viewer).all<TrackRow>();
  return results.map((r) => track(r, viewer));
}

export async function getTrack(db: D1Database, id: string, viewer: string): Promise<{ track: FeedbackTrack; notes: FeedbackNote[] } | null> {
  const r = await db.prepare(`${TRACK_SELECT} WHERE t.id = ?2 AND t.status = 'open' AND ${NOT_BLOCKED('t.user_id')}`).bind(viewer, id).first<TrackRow>();
  if (!r) return null;
  const { results } = await db.prepare(`SELECT n.id, n.user_id, n.body, n.created_at, ${MEMBER_COLS} FROM feedback_notes n ${MEMBER_JOIN('n.user_id')}
      WHERE n.track_id = ?2 AND n.status = 'visible' AND ${NOT_BLOCKED('n.user_id')} ORDER BY n.created_at ASC LIMIT 200`)
    .bind(viewer, id).all<MemberRow & { id: string; user_id: string; body: string; created_at: number }>();
  return { track: track(r, viewer), notes: results.map((n) => ({ id: n.id, body: n.body, at: n.created_at, by: member(n), mine: n.user_id === viewer })) };
}

/** How many other members' tracks this member has left a real note on. The number their level reads. */
export async function givenCount(db: D1Database, userId: string): Promise<number> {
  try {
    const r = await db.prepare(`SELECT COUNT(DISTINCT n.track_id) AS n FROM feedback_notes n JOIN feedback_tracks t ON t.id = n.track_id
      WHERE n.user_id = ?1 AND n.status = 'visible' AND t.user_id <> ?1 AND length(n.body) >= ${FEEDBACK.noteMin}`).bind(userId).first<{ n: number }>();
    return r?.n ?? 0;
  } catch { return 0; }
}

/** Opus is real people: posting and giving feedback need a confirmed email and a live profile, like connecting. */
async function gate(db: D1Database, user: SessionUser, doing: string) {
  if (!(await feedbackReady(db))) throw new HttpError(503, 'Feedback isn’t open here yet.');
  if (!user.emailVerified) throw new HttpError(403, `Confirm your email before ${doing}.`);
  const mine = await db.prepare("SELECT 1 FROM profiles WHERE owner_user_id = ? AND kind = 'musician' AND status = 'published'").bind(user.id).first();
  if (!mine) throw new HttpError(403, `Publish your profile before ${doing}, so people can see who you are.`);
}

export async function postTrack(db: D1Database, user: SessionUser, body: Record<string, unknown>) {
  await gate(db, user, 'posting a track');
  const url = httpsUrl(body.url);
  if (!url) throw new HttpError(400, 'Paste a link to your track (it should start with https://).', 'url');
  const title = line(body.title, FEEDBACK.titleMax);
  if (!title) throw new HttpError(400, 'Give the track a title.', 'title');
  const artwork = typeof body.artwork === 'string' && artworkHostOk(body.artwork) ? body.artwork.slice(0, 500) : '';
  await limit(db, `feedback-track:${user.id}`, FEEDBACK.tracksPerWeek, 7 * 86_400_000).catch(() => {
    throw new HttpError(429, `You can post ${FEEDBACK.tracksPerWeek} tracks a week. Give some feedback while you wait.`);
  });
  const id = randomId(9);
  await db.prepare('INSERT INTO feedback_tracks (id, user_id, url, title, artist, artwork, ask, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, user.id, url, title, line(body.artist, FEEDBACK.artistMax), artwork, line(body.ask, FEEDBACK.askMax), now()).run();
  return { id };
}

export async function postNote(db: D1Database, user: SessionUser, trackId: string, body: Record<string, unknown>) {
  await gate(db, user, 'giving feedback');
  const t = await db.prepare("SELECT user_id FROM feedback_tracks WHERE id = ? AND status = 'open'").bind(trackId).first<{ user_id: string }>();
  if (!t) throw new HttpError(404, 'That track is no longer up.');
  const text = str(body.body, FEEDBACK.noteMax + 1).replace(/\r/g, '').replace(/\n{3,}/g, '\n\n');
  if (text.length > FEEDBACK.noteMax) throw new HttpError(400, `Keep it to ${FEEDBACK.noteMax} characters.`, 'body');
  // The artist can answer briefly on their own track; feedback from others has to say something.
  if (t.user_id !== user.id && text.length < FEEDBACK.noteMin) throw new HttpError(400, `Say a little more: what works, and what you’d change (at least ${FEEDBACK.noteMin} characters).`, 'body');
  if (!text) throw new HttpError(400, 'Write something first.', 'body');
  if (await db.prepare('SELECT 1 FROM blocks WHERE (blocker_id = ?1 AND blocked_id = ?2) OR (blocker_id = ?2 AND blocked_id = ?1)').bind(user.id, t.user_id).first()) throw new HttpError(403, 'You can’t leave feedback here.');
  await limit(db, `feedback-note:${user.id}`, 30, 3_600_000);
  const id = randomId(9);
  await db.prepare('INSERT INTO feedback_notes (id, track_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, trackId, user.id, text, now()).run();
  return { id };
}

/** The member who posted a track takes it down. Its notes go with it. */
export async function removeTrack(db: D1Database, user: SessionUser, trackId: string) {
  const r = await db.prepare(`UPDATE feedback_tracks SET status = 'removed' WHERE id = ? AND status = 'open' AND (user_id = ? OR ? = 'admin')`).bind(trackId, user.id, user.role).run();
  if (!r.meta.changes) throw new HttpError(404, 'Track not found.');
  return { ok: true };
}

/** A note can be removed by whoever wrote it, or by the member whose track it is on. */
export async function removeNote(db: D1Database, user: SessionUser, trackId: string, noteId: string) {
  const r = await db.prepare(`UPDATE feedback_notes SET status = 'removed' WHERE id = ?1 AND track_id = ?2 AND status = 'visible'
    AND (user_id = ?3 OR ?4 = 'admin' OR EXISTS (SELECT 1 FROM feedback_tracks t WHERE t.id = ?2 AND t.user_id = ?3))`).bind(noteId, trackId, user.id, user.role).run();
  if (!r.meta.changes) throw new HttpError(404, 'Note not found.');
  return { ok: true };
}
