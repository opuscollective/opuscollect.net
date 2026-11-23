/**
 * Member connections: one row per pair of members (a unique index on the pair), so there is only ever one
 * relationship between two people. A request carries an optional short introduction and is accepted or declined
 * by the recipient; accepting makes it mutual. Connected members contact each other through private messages;
 * email addresses are never shared. Blocking hides both members from each other's requests and removes any connection.
 */
import { HttpError, audit, now, randomId, str } from './util';
import { limit } from './ratelimit';
import type { SessionUser } from './session';
import { notify } from './messages';
import { visibleLabel } from '@/data/places';
import { SPECIALTIES, type Specialty } from '@/data/specialties';

/** The introduction is optional. This is the suggested text the request form starts with. */
export const DEFAULT_INTRO = 'Hey! I’d love to connect with you on Opus.';
export const INTRO_MAX = 300;

const DAY = 86_400_000;

export type ConnStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn';

export async function isBlockedEitherWay(db: D1Database, a: string, b: string) {
  return !!(await db.prepare('SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)').bind(a, b, b, a).first());
}

/** Relationship between the viewer and another member, for the Connect button. */
export async function relationship(db: D1Database, viewerId: string, otherId: string) {
  if (viewerId === otherId) return { state: 'self' as const };
  const blockedByMe = !!(await db.prepare('SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?').bind(viewerId, otherId).first());
  if (blockedByMe) return { state: 'blocked' as const };
  if (await isBlockedEitherWay(db, viewerId, otherId)) return { state: 'unavailable' as const };
  const c = await db.prepare(`SELECT id, requester_id, status, responded_at FROM connections
      WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`)
    .bind(viewerId, otherId, otherId, viewerId).first<{ id: string; requester_id: string; status: ConnStatus; responded_at: number | null }>();
  if (!c) return { state: 'none' as const };
  if (c.status === 'accepted') return { state: 'connected' as const, id: c.id };
  if (c.status === 'pending') return { state: c.requester_id === viewerId ? ('sent' as const) : ('received' as const), id: c.id };
  return { state: 'none' as const };
}

export async function requestConnection(env: Env, user: SessionUser, body: { to?: unknown; message?: unknown }) {
  const db = env.DB;
  if (!user.emailVerified) throw new HttpError(403, 'Confirm your email before sending connection requests.');
  const mine = await db.prepare("SELECT id FROM profiles WHERE owner_user_id = ? AND kind = 'musician' AND status = 'published'").bind(user.id).first();
  if (!mine) throw new HttpError(403, 'Publish your profile first, so the people you contact can see who you are.');
  const handle = str(body.to, 40);
  const target = await db.prepare("SELECT owner_user_id, open_to_collab, status FROM profiles WHERE handle = ? AND kind = 'musician'").bind(handle).first<{ owner_user_id: string; open_to_collab: number; status: string }>();
  if (!target || target.status !== 'published') throw new HttpError(404, 'That profile isn’t available.');
  if (target.owner_user_id === user.id) throw new HttpError(400, 'That’s your own profile.');
  if (await isBlockedEitherWay(db, user.id, target.owner_user_id)) throw new HttpError(403, 'You can’t connect with this member.');
  const raw = typeof body.message === 'string' ? body.message.trim() : '';
  if (raw.length > INTRO_MAX) throw new HttpError(400, `Keep your introduction to ${INTRO_MAX} characters.`, 'message');
  // Plain text only: line breaks are kept, other control characters dropped. Pages escape it when shown.
  const message = raw.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n');
  await limit(db, `connect:${user.id}`, 20, DAY);

  const existing = await db.prepare(`SELECT id, requester_id, status, responded_at, created_at FROM connections
      WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`)
    .bind(user.id, target.owner_user_id, target.owner_user_id, user.id).first<{ id: string; requester_id: string; status: ConnStatus; responded_at: number | null; created_at: number }>();
  if (existing) {
    if (existing.status === 'accepted') throw new HttpError(409, 'You’re already connected.');
    if (existing.status === 'pending' && existing.requester_id === user.id) throw new HttpError(409, 'Your request is waiting for a reply.');
    // Crossed requests: they already asked you. Sending one back means you both want it, so accept theirs.
    if (existing.status === 'pending') {
      const done = await db.prepare("UPDATE connections SET status = 'accepted', responded_at = ? WHERE id = ? AND status = 'pending' AND addressee_id = ?").bind(now(), existing.id, user.id).run();
      if (done.meta.changes) {
        await notify(env, target.owner_user_id, 'connection_accepted', user.id, existing.id);
        await db.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE user_id = ? AND ref_id = ? AND kind = 'connection_request'").bind(now(), user.id, existing.id).run();
        await audit(db, user.id, 'connection.accept', { id: existing.id, crossed: true });
      }
      return { id: existing.id, connected: true };
    }
    // Declined or withdrawn: allow a new request after 30 days.
    const since = existing.responded_at ?? existing.created_at;
    if (existing.status === 'declined' && existing.requester_id === user.id && now() - since < 30 * DAY) throw new HttpError(429, 'You can send a new request 30 days after a decline.');
    await db.prepare("UPDATE connections SET requester_id = ?, addressee_id = ?, message = ?, status = 'pending', created_at = ?, responded_at = NULL WHERE id = ?")
      .bind(user.id, target.owner_user_id, message, now(), existing.id).run();
    await notify(env, target.owner_user_id, 'connection_request', user.id, existing.id);
    return { id: existing.id };
  }
  const id = randomId();
  try {
    await db.prepare("INSERT INTO connections (id, requester_id, addressee_id, message, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)")
      .bind(id, user.id, target.owner_user_id, message, now()).run();
  } catch (e) {
    // Two requests at the same moment: the pair index lets only one row exist.
    if (String(e).includes('UNIQUE')) throw new HttpError(409, 'There’s already a request between you. Refresh to see it.');
    throw e;
  }
  await audit(db, user.id, 'connection.requested', { id });
  await notify(env, target.owner_user_id, 'connection_request', user.id, id);
  return { id };
}

export async function actOnConnection(env: Env, user: SessionUser, id: string, action: unknown) {
  const db = env.DB;
  const c = await db.prepare('SELECT * FROM connections WHERE id = ?').bind(id).first<{ id: string; requester_id: string; addressee_id: string; status: ConnStatus }>();
  if (!c || (c.requester_id !== user.id && c.addressee_id !== user.id)) throw new HttpError(404, 'Connection not found.');
  const t = now();
  switch (action) {
    case 'accept':
    case 'decline':
      if (c.addressee_id !== user.id || c.status !== 'pending') throw new HttpError(400, 'This request can’t be answered.');
      if (!(await db.prepare("UPDATE connections SET status = ?, responded_at = ? WHERE id = ? AND status = 'pending'").bind(action === 'accept' ? 'accepted' : 'declined', t, id).run()).meta.changes) throw new HttpError(409, 'This request was already answered.');
      // The requester hears about an acceptance; a decline stays quiet.
      if (action === 'accept') await notify(env, c.requester_id, 'connection_accepted', user.id, id);
      // The request notification is answered either way.
      await db.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE user_id = ? AND ref_id = ? AND kind = 'connection_request'").bind(t, user.id, id).run();
      break;
    case 'withdraw':
      if (c.requester_id !== user.id || c.status !== 'pending') throw new HttpError(400, 'This request can’t be withdrawn.');
      if (!(await db.prepare("UPDATE connections SET status = 'withdrawn', responded_at = ? WHERE id = ? AND status = 'pending'").bind(t, id).run()).meta.changes) throw new HttpError(409, 'This request was already answered.');
      // The request no longer needs an answer.
      await db.prepare("DELETE FROM notifications WHERE ref_id = ? AND kind = 'connection_request'").bind(id).run();
      break;
    case 'remove':
      if (c.status !== 'accepted') throw new HttpError(400, 'You’re not connected.');
      await db.prepare('DELETE FROM connections WHERE id = ?').bind(id).run();
      break;
    default:
      throw new HttpError(400, 'Unknown action.');
  }
  await audit(db, user.id, `connection.${action}`, { id });
}

export async function block(env: Env, user: SessionUser, handle: unknown, on: boolean) {
  const db = env.DB;
  const target = await db.prepare("SELECT owner_user_id FROM profiles WHERE handle = ?").bind(str(handle, 40)).first<{ owner_user_id: string }>();
  if (!target || target.owner_user_id === user.id) throw new HttpError(404, 'Member not found.');
  if (on) {
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)').bind(user.id, target.owner_user_id, now()),
      db.prepare('DELETE FROM connections WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)')
        .bind(user.id, target.owner_user_id, target.owner_user_id, user.id),
    ]);
  } else {
    await db.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').bind(user.id, target.owner_user_id).run();
  }
  await audit(db, user.id, on ? 'member.blocked' : 'member.unblocked');
}

export interface ConnItem {
  id: string; status: ConnStatus; message: string; createdAt: number; respondedAt: number | null; direction: 'in' | 'out';
  other: { handle: string | null; name: string; specialty: string | null; specialtyKey: string | null; place: string; photoKey: string | null; verified: boolean };
}

export async function listConnections(db: D1Database, userId: string) {
  const rows = await db.prepare(`
    SELECT c.id, c.status, c.message, c.created_at, c.responded_at, c.requester_id,
           p.handle, p.display_name, p.primary_specialty, p.place_id, p.location_visibility, p.photo_key, p.verification, p.status AS pstatus
    FROM connections c
    LEFT JOIN profiles p ON p.owner_user_id = (CASE WHEN c.requester_id = ?1 THEN c.addressee_id ELSE c.requester_id END) AND p.kind = 'musician'
    WHERE (c.requester_id = ?1 OR c.addressee_id = ?1) AND c.status IN ('pending', 'accepted')
      AND NOT EXISTS (SELECT 1 FROM blocks k WHERE k.blocker_id = ?1 AND k.blocked_id = (CASE WHEN c.requester_id = ?1 THEN c.addressee_id ELSE c.requester_id END))
    ORDER BY COALESCE(c.responded_at, c.created_at) DESC LIMIT 1000`)
    .bind(userId)
    .all<{ id: string; status: ConnStatus; message: string; created_at: number; responded_at: number | null; requester_id: string; handle: string | null; display_name: string | null; primary_specialty: string | null; place_id: string | null; location_visibility: 'city' | 'metro' | 'region' | 'hidden' | null; photo_key: string | null; verification: string | null; pstatus: string | null }>();
  const items: ConnItem[] = rows.results.map((r) => {
    const live = r.pstatus === 'published';
    return {
      id: r.id, status: r.status, message: r.message, createdAt: r.created_at, respondedAt: r.responded_at, direction: r.requester_id === userId ? 'out' : 'in',
      // Only public profile facts, honouring the member's location choice. Never email.
      other: {
        handle: live ? r.handle : null, name: r.display_name ?? 'Opus member',
        specialty: r.primary_specialty ? SPECIALTIES[r.primary_specialty as Specialty]?.label ?? null : null, specialtyKey: r.primary_specialty,
        place: live ? visibleLabel(r.place_id, r.location_visibility ?? 'city') : '', photoKey: live ? r.photo_key : null, verified: live && r.verification === 'verified',
      },
    };
  });
  const blocked = await db.prepare(`SELECT p.handle, p.display_name FROM blocks b LEFT JOIN profiles p ON p.owner_user_id = b.blocked_id AND p.kind = 'musician' WHERE b.blocker_id = ?`)
    .bind(userId).all<{ handle: string | null; display_name: string | null }>();
  return {
    incoming: items.filter((i) => i.status === 'pending' && i.direction === 'in'),
    outgoing: items.filter((i) => i.status === 'pending' && i.direction === 'out'),
    connected: items.filter((i) => i.status === 'accepted'),
    blocked: blocked.results,
  };
}
