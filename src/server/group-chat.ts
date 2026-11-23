/**
 * Group chat: one private room per group, for its active members (and its owner and admins).
 *
 * - Lives in group_messages / group_reads (migration 0014). Nothing here is public.
 * - A member can share one of their own upcoming sessions as a small card. The server reads the
 *   session from the member's Future, so a card can't be made up, and it keeps only title, place,
 *   time and (for public events) the link, never a private booking page.
 * - Shared sessions that haven't started yet feed the group page's "Upcoming" for members.
 */
import { HttpError, now } from './util';
import { limit } from './ratelimit';
import { cleanBody } from '@/lib/chat-rules';
import { tellRoom, type ChatAuthor } from './chat';
import { AUTHOR_COLS, AUTHOR_SQL, author, type AuthorRow } from './messages';
import { futureFor } from './future';
import { mediaUrl } from './profiles';

export const GROUP_MSG_MAX = 2000;
const PAGE = 50;

export interface SessionCard { title: string; detail: string; when: string; at: number; href: string | null }
export interface GroupMsg { id: number; kind: 'text' | 'session'; body: string; session: SessionCard | null; at: number; mine: boolean; author: ChatAuthor }
export interface GroupRoom { id: string; handle: string; name: string; photo: string | null; typeLabel: string; preview: string; at: number | null; unread: boolean; members: number }

const parse = <T,>(s: string | null, f: T): T => { try { return s ? (JSON.parse(s) as T) : f; } catch { return f; } };

/** Active members, plus the owner and admins (who may not be on the public roster). */
const MEMBER_OF = `(EXISTS (SELECT 1 FROM clan_members m WHERE m.clan_id = p.id AND m.user_id = ?1 AND m.status = 'active')
  OR p.owner_user_id = ?1
  OR EXISTS (SELECT 1 FROM profile_managers pm WHERE pm.profile_id = p.id AND pm.user_id = ?1 AND pm.role = 'admin'))`;

export async function isGroupMember(db: D1Database, clanId: string, userId: string) {
  const r = await db.prepare(`SELECT 1 AS ok FROM profiles p JOIN clan_details d ON d.profile_id = p.id WHERE p.id = ?2 AND ${MEMBER_OF}`).bind(userId, clanId).first();
  return !!r;
}

async function requireMember(db: D1Database, clanId: string, userId: string) {
  if (!(await isGroupMember(db, clanId, userId))) throw new HttpError(404, 'Group not found.');
}

/** Every group I'm in, with the last message and whether there's something new. */
export async function listGroupRooms(db: D1Database, me: string): Promise<GroupRoom[]> {
  const rows = await db.prepare(`SELECT p.id, p.handle, p.display_name, p.photo_key, d.group_type,
      (SELECT COUNT(*) FROM clan_members x WHERE x.clan_id = p.id AND x.status = 'active') AS members,
      (SELECT g.id FROM group_messages g WHERE g.clan_id = p.id ORDER BY g.id DESC LIMIT 1) AS last_id,
      COALESCE((SELECT r.read_at FROM group_reads r WHERE r.clan_id = p.id AND r.user_id = ?1), 0) AS my_read
    FROM profiles p JOIN clan_details d ON d.profile_id = p.id
    WHERE ${MEMBER_OF}
    ORDER BY p.display_name LIMIT 100`).bind(me).all<{ id: string; handle: string; display_name: string; photo_key: string | null; group_type: string; members: number; last_id: number | null; my_read: number }>();
  const out: GroupRoom[] = [];
  for (const r of rows.results) {
    const last = r.last_id ? await db.prepare('SELECT sender_id, kind, body, session, created_at FROM group_messages WHERE id = ?').bind(r.last_id).first<{ sender_id: string; kind: string; body: string; session: string | null; created_at: number }>() : null;
    const card = last?.kind === 'session' ? parse<SessionCard | null>(last.session, null) : null;
    out.push({
      id: r.id, handle: r.handle, name: r.display_name, photo: mediaUrl(r.photo_key), typeLabel: r.group_type, members: r.members,
      preview: last ? (card ? `Shared a session · ${card.title}` : last.body.slice(0, 140)) : '',
      at: last?.created_at ?? null,
      unread: !!last && last.sender_id !== me && last.created_at > r.my_read,
    });
  }
  return out.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

const toMsg = (r: AuthorRow & { id: number; sender_id: string; kind: string; body: string; session: string | null; created_at: number }, me: string): GroupMsg => ({
  id: r.id, kind: r.kind === 'session' ? 'session' : 'text', body: r.body, session: r.kind === 'session' ? parse<SessionCard | null>(r.session, null) : null,
  at: r.created_at, mine: r.sender_id === me, author: author(r),
});

const MSG_SELECT = (extra: string) => `SELECT g.id, g.sender_id, g.kind, g.body, g.session, g.created_at, ${AUTHOR_COLS('p')}
  FROM group_messages g ${AUTHOR_SQL('p', 'g.sender_id')}
  WHERE g.clan_id = ?1 AND NOT EXISTS (SELECT 1 FROM blocks k WHERE k.blocker_id = ?2 AND k.blocked_id = g.sender_id) ${extra}`;

/** Newest page, oldest first. Opening the room (no `before`) marks it read. */
export async function groupMessages(db: D1Database, me: string, clanId: string, before?: number) {
  await requireMember(db, clanId, me);
  const rows = await db.prepare(`${MSG_SELECT(before ? 'AND g.id < ?3' : '')} ORDER BY g.id DESC LIMIT ${PAGE}`)
    .bind(...(before ? [clanId, me, before] : [clanId, me])).all<AuthorRow & { id: number; sender_id: string; kind: string; body: string; session: string | null; created_at: number }>();
  if (!before) await markGroupRead(db, me, clanId);
  return { messages: rows.results.reverse().map((r) => toMsg(r, me)), more: rows.results.length === PAGE };
}

/** Messages newer than `after`, for catching up without a socket. */
export async function groupMessagesSince(db: D1Database, me: string, clanId: string, after: number) {
  await requireMember(db, clanId, me);
  const rows = await db.prepare(`${MSG_SELECT('AND g.id > ?3')} ORDER BY g.id ASC LIMIT 100`).bind(clanId, me, after)
    .all<AuthorRow & { id: number; sender_id: string; kind: string; body: string; session: string | null; created_at: number }>();
  await markGroupRead(db, me, clanId);
  return { messages: rows.results.map((r) => toMsg(r, me)) };
}

export async function markGroupRead(db: D1Database, me: string, clanId: string) {
  await db.prepare('INSERT INTO group_reads (clan_id, user_id, read_at) VALUES (?, ?, ?) ON CONFLICT(clan_id, user_id) DO UPDATE SET read_at = excluded.read_at')
    .bind(clanId, me, now()).run();
}

async function memberIds(db: D1Database, clanId: string) {
  const { results } = await db.prepare(`SELECT user_id AS u FROM clan_members WHERE clan_id = ?1 AND status = 'active' AND user_id IS NOT NULL
    UNION SELECT owner_user_id FROM profiles WHERE id = ?1
    UNION SELECT user_id FROM profile_managers WHERE profile_id = ?1 AND role = 'admin'`).bind(clanId).all<{ u: string }>();
  return results.map((r) => r.u);
}

export interface SendInput { body?: unknown; cid?: unknown; sessionId?: unknown }

export async function sendGroupMessage(env: Env, me: string, clanId: string, input: SendInput) {
  const db = env.DB;
  await requireMember(db, clanId, me);
  await limit(db, `grp:${me}`, 60, 60_000);
  const clientId = typeof input.cid === 'string' ? input.cid.slice(0, 40) : null;

  let kind: 'text' | 'session' = 'text', body = '', session: SessionCard | null = null;
  if (typeof input.sessionId === 'string' && input.sessionId) {
    const item = (await futureFor(db, me)).find((i) => i.id === input.sessionId && !i.past);
    if (!item || !item.at) throw new HttpError(404, 'That session isn’t on your Future with a set time.');
    kind = 'session';
    // Private booking pages stay private; only a public event link travels with the card.
    session = { title: item.title.slice(0, 120), detail: item.detail.slice(0, 160), when: item.when, at: item.at, href: item.kind === 'event' && item.href.startsWith('/') ? item.href : null };
    body = cleanBody(input.body).slice(0, GROUP_MSG_MAX);
  } else {
    body = cleanBody(input.body);
    if (!body) throw new HttpError(400, 'Write something first.');
    if (body.length > GROUP_MSG_MAX) throw new HttpError(400, `Keep it under ${GROUP_MSG_MAX} characters.`);
  }

  const t = now();
  const ins = await db.prepare('INSERT OR IGNORE INTO group_messages (clan_id, sender_id, kind, body, session, session_at, client_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id')
    .bind(clanId, me, kind, body, session ? JSON.stringify(session) : null, session?.at ?? null, clientId, t).first<{ id: number }>();
  if (!ins) {
    const prev = await db.prepare(`${MSG_SELECT('AND g.client_id = ?3 AND g.sender_id = ?2')}`).bind(clanId, me, clientId)
      .first<AuthorRow & { id: number; sender_id: string; kind: string; body: string; session: string | null; created_at: number }>();
    if (prev) return { message: toMsg(prev, me) };
    throw new HttpError(500, 'Couldn’t send. Try again.');
  }
  await markGroupRead(db, me, clanId);
  const who = await db.prepare(`SELECT ${AUTHOR_COLS('p')} FROM users u ${AUTHOR_SQL('p', 'u.id')} WHERE u.id = ?`).bind(me).first<AuthorRow>();
  const others = (await memberIds(db, clanId));
  try { await tellRoom(env, '/nudge', { uids: others, event: { kind: 'group', clan: clanId } }); } catch (e) { console.error('group nudge', e); }
  return { message: toMsg({ ...(who ?? { handle: null, display_name: null, photo_key: null, verification: null, pstatus: null, city: null }), id: ins.id, sender_id: me, kind, body, session: session ? JSON.stringify(session) : null, created_at: t }, me) };
}

/** The sender, or a group admin, can take a message down. */
export async function removeGroupMessage(env: Env, me: string, clanId: string, messageId: number) {
  const db = env.DB;
  await requireMember(db, clanId, me);
  const m = await db.prepare('SELECT sender_id FROM group_messages WHERE id = ? AND clan_id = ?').bind(messageId, clanId).first<{ sender_id: string }>();
  if (!m) throw new HttpError(404, 'Message not found.');
  if (m.sender_id !== me) {
    const admin = await db.prepare(`SELECT 1 AS ok FROM profiles p WHERE p.id = ?2 AND (p.owner_user_id = ?1 OR EXISTS (SELECT 1 FROM profile_managers pm WHERE pm.profile_id = p.id AND pm.user_id = ?1 AND pm.role = 'admin'))`).bind(me, clanId).first();
    if (!admin) throw new HttpError(403, 'Only the sender or a group admin can remove this.');
  }
  await db.prepare('DELETE FROM group_messages WHERE id = ?').bind(messageId).run();
  try { await tellRoom(env, '/nudge', { uids: await memberIds(db, clanId), event: { kind: 'group', clan: clanId } }); } catch { /* best effort */ }
  return { ok: true };
}

/** My upcoming sessions that I could share (set date, not past). */
export async function shareableSessions(db: D1Database, me: string, clanId: string) {
  await requireMember(db, clanId, me);
  return (await futureFor(db, me)).filter((i) => !i.past && i.at && i.at > now())
    .sort((a, b) => a.at - b.at).slice(0, 20)
    .map((i) => ({ id: i.id, title: i.title, detail: i.detail, when: i.when, kind: i.kind }));
}

/** Sessions members shared that haven't started yet, soonest first. Members only; the caller checks. */
export async function groupUpcoming(db: D1Database, clanId: string): Promise<(SessionCard & { id: number; by: string })[]> {
  const { results } = await db.prepare(`SELECT g.id, g.session, COALESCE(p.display_name, 'A member') AS by_name
    FROM group_messages g LEFT JOIN profiles p ON p.owner_user_id = g.sender_id AND p.kind = 'musician'
    WHERE g.clan_id = ? AND g.kind = 'session' AND g.session_at > ? ORDER BY g.session_at LIMIT 12`).bind(clanId, now()).all<{ id: number; session: string; by_name: string }>();
  // The same session shared twice shows once.
  const seen = new Set<string>();
  return results.flatMap((r) => {
    const c = parse<SessionCard | null>(r.session, null);
    if (!c || seen.has(`${c.title}|${c.at}`)) return [];
    seen.add(`${c.title}|${c.at}`);
    return [{ ...c, id: r.id, by: r.by_name }];
  });
}

/** Rooms with something new for me. Counted in the Messages badge. Returns 0 until migration 0014 is applied. */
export async function groupUnread(db: D1Database, me: string): Promise<number> {
  try {
    const r = await db.prepare(`SELECT COUNT(*) AS n FROM profiles p JOIN clan_details d ON d.profile_id = p.id
      WHERE ${MEMBER_OF} AND EXISTS (
        SELECT 1 FROM group_messages g WHERE g.clan_id = p.id AND g.sender_id <> ?1
          AND g.created_at > COALESCE((SELECT r.read_at FROM group_reads r WHERE r.clan_id = p.id AND r.user_id = ?1), 0)
          AND NOT EXISTS (SELECT 1 FROM blocks k WHERE k.blocker_id = ?1 AND k.blocked_id = g.sender_id))`).bind(me).first<{ n: number }>();
    return r?.n ?? 0;
  } catch { return 0; }
}
