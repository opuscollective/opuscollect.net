/**
 * Member connections: a request with a short introduction, accepted or declined by the recipient.
 * Accepted connections can see each other's email so they can actually work together.
 * Blocking hides both members from each other's requests and removes any connection.
 */
import { HttpError, audit, now, randomId, str } from './util';
import { limit } from './ratelimit';
import type { SessionUser } from './session';
import { notify } from './messages';

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
  if (!target.open_to_collab) throw new HttpError(403, 'This member isn’t taking new collaboration requests right now.');
  const message = str(body.message, 600);
  if (message.length < 20) throw new HttpError(400, 'Add a short introduction (20 characters or more): who you are and what you’d like to work on.', 'message');
  await limit(db, `connect:${user.id}`, 20, DAY);

  const existing = await db.prepare(`SELECT id, requester_id, status, responded_at, created_at FROM connections
      WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`)
    .bind(user.id, target.owner_user_id, target.owner_user_id, user.id).first<{ id: string; requester_id: string; status: ConnStatus; responded_at: number | null; created_at: number }>();
  if (existing) {
    if (existing.status === 'accepted') throw new HttpError(409, 'You’re already connected.');
    if (existing.status === 'pending') throw new HttpError(409, existing.requester_id === user.id ? 'Your request is waiting for a reply.' : 'They already sent you a request. Check your connections.');
    // Declined or withdrawn: allow a new request after 30 days.
    const since = existing.responded_at ?? existing.created_at;
    if (existing.status === 'declined' && existing.requester_id === user.id && now() - since < 30 * DAY) throw new HttpError(429, 'You can send a new request 30 days after a decline.');
    await db.prepare("UPDATE connections SET requester_id = ?, addressee_id = ?, message = ?, status = 'pending', created_at = ?, responded_at = NULL WHERE id = ?")
      .bind(user.id, target.owner_user_id, message, now(), existing.id).run();
    await notify(env, target.owner_user_id, 'connection_request', user.id, existing.id);
    return { id: existing.id };
  }
  const id = randomId();
  await db.prepare("INSERT INTO connections (id, requester_id, addressee_id, message, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)")
    .bind(id, user.id, target.owner_user_id, message, now()).run();
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
      await db.prepare('UPDATE connections SET status = ?, responded_at = ? WHERE id = ?').bind(action === 'accept' ? 'accepted' : 'declined', t, id).run();
      // The requester hears about an acceptance; a decline stays quiet.
      if (action === 'accept') await notify(env, c.requester_id, 'connection_accepted', user.id, id);
      // The request notification is answered either way.
      await db.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE user_id = ? AND ref_id = ? AND kind = 'connection_request'").bind(t, user.id, id).run();
      break;
    case 'withdraw':
      if (c.requester_id !== user.id || c.status !== 'pending') throw new HttpError(400, 'This request can’t be withdrawn.');
      await db.prepare("UPDATE connections SET status = 'withdrawn', responded_at = ? WHERE id = ?").bind(t, id).run();
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
  id: string; status: ConnStatus; message: string; createdAt: number; direction: 'in' | 'out';
  other: { handle: string | null; name: string; specialty: string | null; placeId: string | null; photoKey: string | null; email?: string };
}

export async function listConnections(db: D1Database, userId: string) {
  const rows = await db.prepare(`
    SELECT c.id, c.status, c.message, c.created_at, c.requester_id,
           CASE WHEN c.requester_id = ? THEN c.addressee_id ELSE c.requester_id END AS other_id,
           p.handle, p.display_name, p.primary_specialty, p.place_id, p.photo_key, u.email
    FROM connections c
    JOIN users u ON u.id = (CASE WHEN c.requester_id = ? THEN c.addressee_id ELSE c.requester_id END)
    LEFT JOIN profiles p ON p.owner_user_id = u.id AND p.kind = 'musician'
    WHERE (c.requester_id = ? OR c.addressee_id = ?) AND c.status IN ('pending', 'accepted')
    ORDER BY c.created_at DESC LIMIT 500`)
    .bind(userId, userId, userId, userId)
    .all<{ id: string; status: ConnStatus; message: string; created_at: number; requester_id: string; handle: string | null; display_name: string | null; primary_specialty: string | null; place_id: string | null; photo_key: string | null; email: string }>();
  const items: ConnItem[] = rows.results.map((r) => ({
    id: r.id, status: r.status, message: r.message, createdAt: r.created_at, direction: r.requester_id === userId ? 'out' : 'in',
    other: {
      handle: r.handle, name: r.display_name ?? 'Opus member', specialty: r.primary_specialty, placeId: r.place_id, photoKey: r.photo_key,
      // Email is shared only once both members have agreed to connect.
      ...(r.status === 'accepted' ? { email: r.email } : {}),
    },
  }));
  const blocked = await db.prepare(`SELECT p.handle, p.display_name FROM blocks b LEFT JOIN profiles p ON p.owner_user_id = b.blocked_id AND p.kind = 'musician' WHERE b.blocker_id = ?`)
    .bind(userId).all<{ handle: string | null; display_name: string | null }>();
  return {
    incoming: items.filter((i) => i.status === 'pending' && i.direction === 'in'),
    outgoing: items.filter((i) => i.status === 'pending' && i.direction === 'out'),
    connected: items.filter((i) => i.status === 'accepted'),
    blocked: blocked.results,
  };
}
