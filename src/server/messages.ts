/**
 * Private messages between mutual connections, and in-app notifications.
 *
 * - A conversation opens only between two members with an accepted connection who haven't
 *   blocked each other. Removing the connection or blocking stops new messages.
 * - No fixed cooldown, only a generous flood limit.
 * - Unread state lives on the conversation (each side's read time), so it's the same on every device.
 * - New messages and connection events are pushed to the member's open sockets through the
 *   Global Chat room; if no socket is open the page catches up by polling.
 */
import { HttpError, audit, now, randomId } from './util';
import { limit } from './ratelimit';
import { isBlockedEitherWay } from './connections';
import { cleanBody } from '@/lib/chat-rules';
import { mediaUrl } from './profiles';
import { tellRoom, type ChatAuthor } from './chat';

export const DM_MAX = 2000;
const PAGE = 50;

const sorted = (x: string, y: string) => (x < y ? [x, y] : [y, x]) as [string, string];

const AUTHOR_SQL = (alias: string, uidExpr: string) => `
  LEFT JOIN profiles ${alias} ON ${alias}.owner_user_id = ${uidExpr} AND ${alias}.kind = 'musician'
  LEFT JOIN places ${alias}pl ON ${alias}pl.id = ${alias}.place_id
  LEFT JOIN places ${alias}m ON ${alias}m.id = ${alias}pl.metro_id`;
const AUTHOR_COLS = (a: string) => `${a}.handle AS handle, ${a}.display_name AS display_name, ${a}.photo_key AS photo_key, ${a}.verification AS verification, ${a}.status AS pstatus,
  CASE WHEN COALESCE(${a}.location_visibility, 'city') IN ('city', 'metro') THEN ${a}m.name ELSE NULL END AS city`;
interface AuthorRow { handle: string | null; display_name: string | null; photo_key: string | null; verification: string | null; pstatus: string | null; city: string | null }
const author = (r: AuthorRow): ChatAuthor => (r.handle && r.pstatus === 'published'
  ? { handle: r.handle, name: r.display_name ?? 'Opus member', photo: mediaUrl(r.photo_key), city: r.city, verified: r.verification === 'verified' }
  : { handle: '', name: r.display_name ?? 'Opus member', photo: null, city: null, verified: false });

export async function areConnected(db: D1Database, a: string, b: string) {
  return !!(await db.prepare(`SELECT 1 FROM connections WHERE status = 'accepted' AND
      ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))`).bind(a, b, b, a).first());
}

/** Accepted connections only. Never padded, never estimated. */
export async function connectionCount(db: D1Database, userId: string) {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM connections WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)").bind(userId, userId).first<{ n: number }>();
  return r?.n ?? 0;
}

async function canMessage(db: D1Database, me: string, other: string) {
  if (await isBlockedEitherWay(db, me, other)) throw new HttpError(403, 'You can’t message this member.');
  if (!(await areConnected(db, me, other))) throw new HttpError(403, 'You can message people once you’re connected.');
}

/** Opens (or finds) the conversation with a member, by their handle. */
export async function openConversation(db: D1Database, me: string, handle: unknown) {
  const h = typeof handle === 'string' ? handle.trim().slice(0, 40) : '';
  const target = await db.prepare("SELECT owner_user_id FROM profiles WHERE handle = ? AND kind = 'musician'").bind(h).first<{ owner_user_id: string }>();
  if (!target || target.owner_user_id === me) throw new HttpError(404, 'Member not found.');
  await canMessage(db, me, target.owner_user_id);
  const [a, b] = sorted(me, target.owner_user_id);
  await db.prepare('INSERT OR IGNORE INTO conversations (id, a_id, b_id, created_at) VALUES (?, ?, ?, ?)').bind(randomId(), a, b, now()).run();
  const c = await db.prepare('SELECT id FROM conversations WHERE a_id = ? AND b_id = ?').bind(a, b).first<{ id: string }>();
  return { id: c!.id };
}

interface ConvRow { id: string; a_id: string; b_id: string; last_message_at: number | null; last_sender_id: string | null; last_preview: string; a_read_at: number; b_read_at: number }

async function conversationFor(db: D1Database, me: string, id: string) {
  const c = await db.prepare('SELECT * FROM conversations WHERE id = ?').bind(id).first<ConvRow>();
  if (!c || (c.a_id !== me && c.b_id !== me)) throw new HttpError(404, 'Conversation not found.');
  return { c, other: c.a_id === me ? c.b_id : c.a_id, mine: c.a_id === me ? 'a' : 'b' as 'a' | 'b' };
}

export async function listConversations(db: D1Database, me: string) {
  const rows = await db.prepare(`SELECT c.*, ${AUTHOR_COLS('p')},
      CASE WHEN c.a_id = ?1 THEN c.a_read_at ELSE c.b_read_at END AS my_read,
      EXISTS (SELECT 1 FROM blocks k WHERE (k.blocker_id = ?1 AND k.blocked_id = (CASE WHEN c.a_id = ?1 THEN c.b_id ELSE c.a_id END))) AS blocked_by_me
    FROM conversations c ${AUTHOR_SQL('p', '(CASE WHEN c.a_id = ?1 THEN c.b_id ELSE c.a_id END)')}
    WHERE (c.a_id = ?1 OR c.b_id = ?1) AND c.last_message_at IS NOT NULL
    ORDER BY c.last_message_at DESC LIMIT 200`).bind(me)
    .all<ConvRow & AuthorRow & { my_read: number; blocked_by_me: number }>();
  return rows.results.filter((r) => !r.blocked_by_me).map((r) => ({
    id: r.id, with: author(r), preview: r.last_preview, at: r.last_message_at,
    fromMe: r.last_sender_id === me,
    unread: r.last_sender_id !== me && (r.last_message_at ?? 0) > r.my_read,
  }));
}

export async function conversationMessages(db: D1Database, me: string, id: string, before?: number) {
  const { c, other, mine } = await conversationFor(db, me, id);
  const rows = await db.prepare(`SELECT id, sender_id, body, created_at FROM dm_messages WHERE conversation_id = ? ${before ? 'AND id < ?' : ''} ORDER BY id DESC LIMIT ${PAGE}`)
    .bind(...(before ? [id, before] : [id])).all<{ id: number; sender_id: string; body: string; created_at: number }>();
  const who = await db.prepare(`SELECT ${AUTHOR_COLS('p')} FROM users u ${AUTHOR_SQL('p', 'u.id')} WHERE u.id = ?`).bind(other).first<AuthorRow>();
  if (!before) {
    await markRead(db, me, id, mine);
    // Opening the conversation also answers "they accepted your request" from this person.
    await db.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND actor_id = ? AND kind = 'connection_accepted' AND read_at IS NULL").bind(now(), me, other).run();
  }
  const [connected, blocked] = await Promise.all([areConnected(db, me, other), isBlockedEitherWay(db, me, other)]);
  return {
    id, with: who ? author(who) : author({ handle: null, display_name: null, photo_key: null, verification: null, pstatus: null, city: null }),
    canSend: connected && !blocked,
    // The other side's read time, so "Seen" can be shown on my last message.
    theirReadAt: mine === 'a' ? c.b_read_at : c.a_read_at,
    messages: rows.results.reverse().map((m) => ({ id: m.id, body: m.body, at: m.created_at, mine: m.sender_id === me })),
    more: rows.results.length === PAGE,
  };
}

async function markRead(db: D1Database, me: string, id: string, side?: 'a' | 'b') {
  const s = side ?? (await conversationFor(db, me, id)).mine;
  await db.prepare(`UPDATE conversations SET ${s}_read_at = ? WHERE id = ?`).bind(now(), id).run();
}
export const markConversationRead = (db: D1Database, me: string, id: string) => markRead(db, me, id);

export async function sendDm(env: Env, me: string, id: string, raw: unknown, cid: unknown) {
  const db = env.DB;
  const { other } = await conversationFor(db, me, id);
  await canMessage(db, me, other);
  const body = cleanBody(raw);
  if (!body) throw new HttpError(400, 'Write something first.');
  if (body.length > DM_MAX) throw new HttpError(400, `Keep it under ${DM_MAX} characters.`);
  // No fixed cooldown in private messages; this only stops floods.
  await limit(db, `dm:${me}`, 60, 60_000);
  const clientId = typeof cid === 'string' ? cid.slice(0, 40) : null;
  const t = now();
  const ins = await db.prepare('INSERT OR IGNORE INTO dm_messages (conversation_id, sender_id, body, client_id, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id')
    .bind(id, me, body, clientId, t).first<{ id: number }>();
  if (!ins) {
    const prev = await db.prepare('SELECT id, body, created_at FROM dm_messages WHERE sender_id = ? AND client_id = ?').bind(me, clientId).first<{ id: number; body: string; created_at: number }>();
    if (prev) return { message: { id: prev.id, body: prev.body, at: prev.created_at, mine: true } };
    throw new HttpError(500, 'Couldn’t send. Try again.');
  }
  const side = me < other ? 'a' : 'b';
  await db.prepare(`UPDATE conversations SET last_message_at = ?, last_sender_id = ?, last_preview = ?, ${side}_read_at = ? WHERE id = ?`)
    .bind(t, me, body.slice(0, 140), t, id).run();
  await tellRoom(env, '/nudge', { uids: [other, me], event: { kind: 'dm', conversation: id } });
  return { message: { id: ins.id, body, at: t, mine: true } };
}

export async function reportDm(db: D1Database, me: string, messageId: number, reason: unknown) {
  if (!['spam', 'promo', 'harassment', 'hate', 'other'].includes(reason as string)) throw new HttpError(400, 'Choose a reason.');
  const m = await db.prepare('SELECT d.id, d.sender_id, c.a_id, c.b_id FROM dm_messages d JOIN conversations c ON c.id = d.conversation_id WHERE d.id = ?')
    .bind(messageId).first<{ id: number; sender_id: string; a_id: string; b_id: string }>();
  if (!m || (m.a_id !== me && m.b_id !== me) || m.sender_id === me) throw new HttpError(404, 'Message not found.');
  await db.prepare('INSERT OR IGNORE INTO chat_reports (id, scope, message_id, reporter_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(randomId(), 'dm', messageId, me, reason, now()).run();
  await audit(db, me, 'dm.reported', { messageId });
  return { ok: true };
}

// ---------- notifications ----------

export async function notify(env: Env, userId: string, kind: 'connection_request' | 'connection_accepted', actorId: string, refId: string) {
  try {
    await env.DB.prepare('INSERT INTO notifications (id, user_id, kind, actor_id, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(randomId(), userId, kind, actorId, refId, now()).run();
    await tellRoom(env, '/nudge', { uids: [userId], event: { kind } });
  } catch (e) { console.error('notify', e); }
}

export async function listNotifications(db: D1Database, me: string) {
  const rows = await db.prepare(`SELECT n.id, n.kind, n.ref_id, n.created_at, n.read_at, ${AUTHOR_COLS('p')},
      (SELECT status FROM connections x WHERE x.id = n.ref_id) AS conn_status
    FROM notifications n ${AUTHOR_SQL('p', 'n.actor_id')}
    WHERE n.user_id = ? AND NOT EXISTS (SELECT 1 FROM blocks k WHERE k.blocker_id = n.user_id AND k.blocked_id = n.actor_id)
    ORDER BY n.created_at DESC LIMIT 50`).bind(me)
    .all<AuthorRow & { id: string; kind: string; ref_id: string; created_at: number; read_at: number | null; conn_status: string | null }>();
  return rows.results.map((r) => ({
    id: r.id, kind: r.kind, connectionId: r.ref_id, at: r.created_at, unread: !r.read_at, who: author(r),
    // A request that was answered or withdrawn shows as such, not as a live button.
    state: r.conn_status ?? 'gone',
  }));
}

export async function readNotifications(db: D1Database, me: string) {
  await db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').bind(now(), me).run();
}

/** The numbers on the Messages launcher. Real counts only. */
export async function unreadSummary(db: D1Database, me: string) {
  const r = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM conversations c WHERE (c.a_id = ?1 OR c.b_id = ?1) AND c.last_sender_id IS NOT NULL AND c.last_sender_id <> ?1
         AND c.last_message_at > (CASE WHEN c.a_id = ?1 THEN c.a_read_at ELSE c.b_read_at END)
         AND NOT EXISTS (SELECT 1 FROM blocks k WHERE k.blocker_id = ?1 AND k.blocked_id = c.last_sender_id)) AS dm,
      (SELECT COUNT(*) FROM notifications n WHERE n.user_id = ?1 AND n.read_at IS NULL) AS notes`).bind(me).first<{ dm: number; notes: number }>();
  return { dm: r?.dm ?? 0, notifications: r?.notes ?? 0 };
}
