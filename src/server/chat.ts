/**
 * Global Chat on the server: who someone is in chat, history, reports and moderation.
 * Sends never happen here: they go through the GlobalChat room (chat-room.ts), the one place
 * the cooldown and content rules are enforced for every tab, device and API caller.
 *
 * Privacy: a message shows the author's name, photo and handle from their published profile,
 * and a city only when their location visibility is city or metro (always the metro name,
 * never a suburb). Never coordinates, never email.
 */
import { HttpError, audit, now, randomId, sha256 } from './util';
import { COOKIE } from './session';
import { mediaUrl } from './profiles';

export interface ChatAuthor { handle: string; name: string; photo: string | null; city: string | null; verified: boolean }

export interface ChatIdentity {
  uid: string;
  createdAt: number;
  mod: boolean;
  /** null when the member can post; otherwise why not. */
  blocker: null | 'verify' | 'profile';
  author: ChatAuthor | null;
}

export interface ChatMessage { id: number; body: string; at: number; author: ChatAuthor }

const AUTHOR_COLS = `p.handle, p.display_name, p.photo_key, p.verification,
  CASE WHEN COALESCE(p.location_visibility, 'city') IN ('city', 'metro') THEN m.name ELSE NULL END AS city`;
const AUTHOR_JOIN = `LEFT JOIN profiles p ON p.owner_user_id = u.id AND p.kind = 'musician' AND p.status = 'published'
  LEFT JOIN places pl ON pl.id = p.place_id
  LEFT JOIN places m ON m.id = pl.metro_id`;

interface AuthorRow { handle: string | null; display_name: string | null; photo_key: string | null; verification: string | null; city: string | null }

const toAuthor = (r: AuthorRow): ChatAuthor | null => r.handle
  ? { handle: r.handle, name: r.display_name ?? 'Opus member', photo: mediaUrl(r.photo_key), city: r.city, verified: r.verification === 'verified' }
  : null;

export async function isModerator(db: D1Database, userId: string, role?: string) {
  if (role === 'admin') return true;
  const r = await db.prepare("SELECT 1 AS ok FROM users u WHERE u.id = ? AND (u.role = 'admin' OR EXISTS (SELECT 1 FROM chat_moderators c WHERE c.user_id = u.id))").bind(userId).first();
  return !!r;
}

/** Everything chat needs to know about a member, read once when their socket opens. */
export async function chatIdentity(db: D1Database, userId: string): Promise<ChatIdentity | null> {
  const r = await db.prepare(`SELECT u.id, u.created_at, u.email_verified_at, u.role,
      EXISTS (SELECT 1 FROM chat_moderators c WHERE c.user_id = u.id) AS is_mod, ${AUTHOR_COLS}
    FROM users u ${AUTHOR_JOIN} WHERE u.id = ?`).bind(userId)
    .first<AuthorRow & { id: string; created_at: number; email_verified_at: number | null; role: string; is_mod: number }>();
  if (!r) return null;
  const author = toAuthor(r);
  return {
    uid: r.id, createdAt: r.created_at, mod: r.role === 'admin' || !!r.is_mod,
    blocker: !r.email_verified_at ? 'verify' : !author ? 'profile' : null,
    author,
  };
}

/** Reads the session cookie straight from a request (the WebSocket upgrade runs before Astro). */
export async function userIdFromRequest(db: D1Database, req: Request): Promise<string | null> {
  const cookie = req.headers.get('cookie') ?? '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  const token = m ? decodeURIComponent(m[1]) : '';
  if (!token || token.length > 100) return null;
  const s = await db.prepare('SELECT user_id, expires_at FROM sessions WHERE id = ?').bind(await sha256(token)).first<{ user_id: string; expires_at: number }>();
  return s && s.expires_at > now() ? s.user_id : null;
}

/** Visible messages, newest last. `before` pages back through history for members. */
export async function history(db: D1Database, opts: { before?: number; limit: number }): Promise<ChatMessage[]> {
  const rows = await db.prepare(`SELECT c.id, c.body, c.created_at, ${AUTHOR_COLS}
      FROM chat_messages c JOIN users u ON u.id = c.user_id ${AUTHOR_JOIN}
      WHERE c.status = 'visible' ${opts.before ? 'AND c.id < ?1' : ''}
      ORDER BY c.id DESC LIMIT ${Math.min(100, Math.max(1, opts.limit | 0))}`)
    .bind(...(opts.before ? [opts.before] : [])).all<AuthorRow & { id: number; body: string; created_at: number }>();
  return rows.results.reverse().map((r) => ({
    id: r.id, body: r.body, at: r.created_at,
    // A member who unpublished their profile keeps their words, without a link.
    author: toAuthor(r) ?? { handle: '', name: 'Opus member', photo: null, city: null, verified: false },
  }));
}

/** Active timeout or ban, if any. */
export async function activeRestriction(db: D1Database, userId: string) {
  return db.prepare(`SELECT kind, until FROM chat_restrictions WHERE user_id = ? AND lifted_at IS NULL AND (until IS NULL OR until > ?)
      ORDER BY (kind = 'ban') DESC, until DESC LIMIT 1`).bind(userId, now()).first<{ kind: 'timeout' | 'ban'; until: number | null }>();
}

/** The one Global Chat room. */
export const room = (env: Env) => env.CHAT.get(env.CHAT.idFromName('global'));

/** Tells the room to push something to people's open sockets. Never fails the caller. */
export async function tellRoom(env: Env, path: '/remove' | '/nudge', body: unknown) {
  try {
    if (!env.CHAT) return;
    await room(env).fetch(`https://room${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  } catch (e) { console.error('room', path, e); }
}

const REASONS = ['spam', 'promo', 'harassment', 'hate', 'other'] as const;
export const HOLD_AFTER_REPORTS = 3;

/** A member reports a Global Chat message. Enough separate reports hide it until a moderator looks. */
export async function reportGlobal(env: Env, userId: string, messageId: number, reason: unknown, note: unknown) {
  const db = env.DB;
  if (!REASONS.includes(reason as never)) throw new HttpError(400, 'Choose a reason.');
  const msg = await db.prepare('SELECT id, user_id, status FROM chat_messages WHERE id = ?').bind(messageId).first<{ id: number; user_id: string; status: string }>();
  if (!msg || msg.status === 'removed') throw new HttpError(404, 'That message is already gone.');
  if (msg.user_id === userId) throw new HttpError(400, 'That’s your own message.');
  await db.prepare('INSERT OR IGNORE INTO chat_reports (id, scope, message_id, reporter_id, reason, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(randomId(), 'global', messageId, userId, reason, typeof note === 'string' ? note.slice(0, 300) : '', now()).run();
  const n = await db.prepare("SELECT COUNT(DISTINCT reporter_id) AS n FROM chat_reports WHERE scope = 'global' AND message_id = ? AND resolved_at IS NULL").bind(messageId).first<{ n: number }>();
  if ((n?.n ?? 0) >= HOLD_AFTER_REPORTS && msg.status === 'visible') {
    await db.prepare("UPDATE chat_messages SET status = 'held' WHERE id = ? AND status = 'visible'").bind(messageId).run();
    await tellRoom(env, '/remove', { ids: [messageId] });
  }
  return { ok: true };
}

type ModAction = 'remove' | 'restore' | 'timeout' | 'ban' | 'unban' | 'dismiss';

/** Moderator actions. Every one is written to the audit log with who did it. */
export async function moderate(env: Env, modId: string, body: { action?: unknown; messageId?: unknown; minutes?: unknown; reason?: unknown }) {
  const db = env.DB;
  const action = body.action as ModAction;
  const messageId = Number(body.messageId);
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 300) : '';
  if (!Number.isInteger(messageId) || messageId <= 0) throw new HttpError(400, 'Choose a message.');
  const msg = await db.prepare('SELECT id, user_id, status FROM chat_messages WHERE id = ?').bind(messageId).first<{ id: number; user_id: string; status: string }>();
  if (!msg) throw new HttpError(404, 'Message not found.');
  if (msg.user_id === modId && action !== 'remove') throw new HttpError(400, 'You can’t restrict yourself.');
  const t = now();
  const resolve = db.prepare("UPDATE chat_reports SET resolved_at = ?, resolved_by = ? WHERE scope = 'global' AND message_id = ? AND resolved_at IS NULL").bind(t, modId, messageId);
  switch (action) {
    case 'remove':
      await db.batch([db.prepare("UPDATE chat_messages SET status = 'removed', removed_by = ?, removed_at = ? WHERE id = ?").bind(modId, t, messageId), resolve]);
      await tellRoom(env, '/remove', { ids: [messageId] });
      break;
    case 'restore':
    case 'dismiss':
      // The message stays (or comes back): reports were not upheld.
      await db.batch([db.prepare("UPDATE chat_messages SET status = 'visible', flagged = 0, removed_by = NULL, removed_at = NULL WHERE id = ?").bind(messageId), resolve]);
      break;
    case 'timeout': {
      const minutes = [10, 60, 1440].includes(Number(body.minutes)) ? Number(body.minutes) : 10;
      await db.batch([
        db.prepare("INSERT INTO chat_restrictions (id, user_id, kind, until, reason, created_by, created_at) VALUES (?, ?, 'timeout', ?, ?, ?, ?)").bind(randomId(), msg.user_id, t + minutes * 60_000, reason, modId, t),
        db.prepare("UPDATE chat_messages SET status = 'removed', removed_by = ?, removed_at = ? WHERE id = ?").bind(modId, t, messageId), resolve,
      ]);
      await tellRoom(env, '/remove', { ids: [messageId] });
      break;
    }
    case 'ban': {
      // A ban also takes down that member's recent messages.
      const recent = await db.prepare("SELECT id FROM chat_messages WHERE user_id = ? AND status = 'visible' AND created_at > ?").bind(msg.user_id, t - 86_400_000).all<{ id: number }>();
      await db.batch([
        db.prepare("INSERT INTO chat_restrictions (id, user_id, kind, until, reason, created_by, created_at) VALUES (?, ?, 'ban', NULL, ?, ?, ?)").bind(randomId(), msg.user_id, reason, modId, t),
        db.prepare("UPDATE chat_messages SET status = 'removed', removed_by = ?, removed_at = ? WHERE user_id = ? AND status <> 'removed' AND created_at > ?").bind(modId, t, msg.user_id, t - 86_400_000),
        resolve,
      ]);
      await tellRoom(env, '/remove', { ids: [messageId, ...recent.results.map((r) => r.id)] });
      break;
    }
    case 'unban':
      await db.prepare('UPDATE chat_restrictions SET lifted_at = ? WHERE user_id = ? AND lifted_at IS NULL').bind(t, msg.user_id).run();
      break;
    default:
      throw new HttpError(400, 'Unknown action.');
  }
  await audit(db, modId, `chat.${action}`, { messageId, target: msg.user_id, reason: reason || undefined });
  return { ok: true };
}

/** The moderator queue: reported, held and flagged messages, oldest first. */
export async function moderationQueue(db: D1Database) {
  const rows = await db.prepare(`SELECT c.id, c.body, c.created_at, c.status, c.flagged, c.flag_reason, ${AUTHOR_COLS},
      (SELECT COUNT(*) FROM chat_reports r WHERE r.scope = 'global' AND r.message_id = c.id AND r.resolved_at IS NULL) AS reports,
      (SELECT GROUP_CONCAT(DISTINCT r.reason) FROM chat_reports r WHERE r.scope = 'global' AND r.message_id = c.id AND r.resolved_at IS NULL) AS reasons,
      EXISTS (SELECT 1 FROM chat_restrictions x WHERE x.user_id = c.user_id AND x.kind = 'ban' AND x.lifted_at IS NULL) AS banned
    FROM chat_messages c JOIN users u ON u.id = c.user_id ${AUTHOR_JOIN}
    WHERE c.status = 'held' OR (c.status = 'visible' AND (c.flagged = 1 OR EXISTS (SELECT 1 FROM chat_reports r WHERE r.scope = 'global' AND r.message_id = c.id AND r.resolved_at IS NULL)))
    ORDER BY c.id ASC LIMIT 200`).all<AuthorRow & { id: number; body: string; created_at: number; status: string; flagged: number; flag_reason: string | null; reports: number; reasons: string | null; banned: number }>();
  return rows.results.map((r) => ({
    id: r.id, body: r.body, at: r.created_at, status: r.status, flagged: !!r.flagged, flagReason: r.flag_reason,
    reports: r.reports, reasons: r.reasons ? r.reasons.split(',') : [], banned: !!r.banned,
    author: toAuthor(r) ?? { handle: '', name: 'Opus member', photo: null, city: null, verified: false },
  }));
}
