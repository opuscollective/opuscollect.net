/**
 * Cookie sessions. The browser holds a random 32-byte token in an HttpOnly, Secure,
 * SameSite=Lax cookie; the database stores only its SHA-256 hash.
 */
import type { AstroCookies } from 'astro';
import { now, randomId, sha256 } from './util';

export const COOKIE = 'opus_session';
export const HINT = 'opus_in';
const TTL = 30 * 24 * 60 * 60 * 1000; // 30 days, sliding
const TOUCH_EVERY = 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  emailVerified: boolean;
  role: 'member' | 'admin';
  sessionId: string;
}

export async function createSession(db: D1Database, cookies: AstroCookies, userId: string, userAgent: string | null, secure: boolean) {
  const token = randomId(32);
  const t = now();
  await db.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(await sha256(token), userId, t, t + TTL, t, (userAgent ?? '').slice(0, 200)).run();
  cookies.set(COOKIE, token, { path: '/', httpOnly: true, secure, sameSite: 'lax', maxAge: TTL / 1000 });
  // Non-secret hint so static pages can show "Account" instead of "Sign in" without a request.
  cookies.set(HINT, '1', { path: '/', httpOnly: false, secure, sameSite: 'lax', maxAge: TTL / 1000 });
}

export async function readSession(db: D1Database, cookies: AstroCookies): Promise<SessionUser | null> {
  const token = cookies.get(COOKIE)?.value;
  if (!token || token.length > 100) {
    if (cookies.has(HINT)) cookies.delete(HINT, { path: '/' });
    return null;
  }
  const id = await sha256(token);
  const row = await db
    .prepare(`SELECT s.id AS sid, s.expires_at, s.last_seen_at, u.id, u.email, u.email_verified_at, u.role
              FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`)
    .bind(id).first<{ sid: string; expires_at: number; last_seen_at: number; id: string; email: string; email_verified_at: number | null; role: 'member' | 'admin' }>();
  if (!row || row.expires_at < now()) {
    if (row) await db.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
    cookies.delete(COOKIE, { path: '/' });
    cookies.delete(HINT, { path: '/' });
    return null;
  }
  if (now() - row.last_seen_at > TOUCH_EVERY) {
    await db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?').bind(now(), now() + TTL, id).run();
  }
  return { id: row.id, email: row.email, emailVerified: !!row.email_verified_at, role: row.role, sessionId: row.sid };
}

export async function destroySession(db: D1Database, cookies: AstroCookies) {
  const token = cookies.get(COOKIE)?.value;
  if (token) await db.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256(token)).run();
  cookies.delete(COOKIE, { path: '/' });
  cookies.delete(HINT, { path: '/' });
}

/** Sign out everywhere except (optionally) the current session, e.g. after a password change. */
export async function destroyOtherSessions(db: D1Database, userId: string, keepSessionId?: string) {
  await db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').bind(userId, keepSessionId ?? '').run();
}
