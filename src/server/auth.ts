/**
 * Account flows: sign up, sign in, email verification, password reset, password change,
 * account deletion. Every function validates input on the server; nothing trusts the browser.
 */
import type { AstroCookies } from 'astro';
import { DUMMY_HASH, hashPassword, passwordProblem, verifyPassword } from './password';
import { limit } from './ratelimit';
import { createSession, destroyOtherSessions, type SessionUser } from './session';
import { resetPasswordMail, sendMail, verifyEmailMail, type EmailResult } from './email';
import { HttpError, audit, isEmail, now, randomId, sha256 } from './util';

const MIN = 60_000;
const VERIFY_TTL = 24 * 60 * MIN;
const RESET_TTL = 60 * MIN;

interface Ctx { env: Env; cookies: AstroCookies; request: Request; ip: string; origin: string; secure: boolean }

const normEmail = (e: unknown) => (typeof e === 'string' ? e.trim().toLowerCase() : '');

async function issueToken(db: D1Database, userId: string, purpose: 'verify_email' | 'reset_password', ttl: number) {
  // Only the newest link of each kind works.
  await db.prepare('UPDATE auth_tokens SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL').bind(now(), userId, purpose).run();
  const token = randomId(32);
  await db.prepare('INSERT INTO auth_tokens (id, user_id, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256(token), userId, purpose, now() + ttl, now()).run();
  return token;
}

/** Marks a token used and returns its user id, or null if invalid, expired or already used. */
async function consumeToken(db: D1Database, token: string, purpose: 'verify_email' | 'reset_password') {
  if (!token || token.length > 100) return null;
  const row = await db
    .prepare('UPDATE auth_tokens SET used_at = ? WHERE id = ? AND purpose = ? AND used_at IS NULL AND expires_at > ? RETURNING user_id')
    .bind(now(), await sha256(token), purpose, now()).first<{ user_id: string }>();
  return row?.user_id ?? null;
}

export async function sendVerification(ctx: Ctx, user: { id: string; email: string }): Promise<EmailResult> {
  const token = await issueToken(ctx.env.DB, user.id, 'verify_email', VERIFY_TTL);
  return sendMail(ctx.env, verifyEmailMail(user.email, `${ctx.origin}/verify-email?token=${token}`));
}

export async function register(ctx: Ctx, body: { email?: unknown; password?: unknown; agree?: unknown }) {
  const db = ctx.env.DB;
  const email = normEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address.', 'email');
  const pwErr = passwordProblem(password);
  if (pwErr) throw new HttpError(400, pwErr, 'password');
  if (body.agree !== true) throw new HttpError(400, 'Please accept the terms and privacy policy to continue.', 'agree');
  await limit(db, `register:ip:${ctx.ip}`, 10, 60 * MIN);

  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) throw new HttpError(409, 'An account with this email already exists. Try signing in or resetting your password.', 'email');

  const id = randomId();
  const t = now();
  await db.prepare('INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, email, await hashPassword(password), t, t).run();
  await audit(db, id, 'account.created');
  await createSession(db, ctx.cookies, id, ctx.request.headers.get('user-agent'), ctx.secure);
  const email_status = await sendVerification(ctx, { id, email });
  return { id, email, email_status };
}

export async function login(ctx: Ctx, body: { email?: unknown; password?: unknown }) {
  const db = ctx.env.DB;
  const email = normEmail(body.email);
  const password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
  await limit(db, `login:ip:${ctx.ip}`, 30, 15 * MIN);
  await limit(db, `login:email:${email}`, 8, 15 * MIN);
  const user = await db.prepare('SELECT id, password_hash FROM users WHERE email = ?').bind(email).first<{ id: string; password_hash: string }>();
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'That email and password don’t match an account.');
  await createSession(db, ctx.cookies, user.id, ctx.request.headers.get('user-agent'), ctx.secure);
  await audit(db, user.id, 'account.signed_in');
  return { id: user.id };
}

export async function verifyEmail(env: Env, token: string) {
  const userId = await consumeToken(env.DB, token, 'verify_email');
  if (!userId) return false;
  await env.DB.prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?').bind(now(), now(), userId).run();
  await audit(env.DB, userId, 'account.email_verified');
  return true;
}

export async function resendVerification(ctx: Ctx, user: SessionUser) {
  if (user.emailVerified) return 'already' as const;
  await limit(ctx.env.DB, `verify:user:${user.id}`, 5, 60 * MIN);
  return sendVerification(ctx, user);
}

/** Always answers the same way so the form can't be used to discover which emails have accounts. */
export async function requestReset(ctx: Ctx, body: { email?: unknown }) {
  const db = ctx.env.DB;
  const email = normEmail(body.email);
  if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address.', 'email');
  await limit(db, `reset:ip:${ctx.ip}`, 10, 60 * MIN);
  await limit(db, `reset:email:${email}`, 3, 60 * MIN);
  const user = await db.prepare('SELECT id, email FROM users WHERE email = ?').bind(email).first<{ id: string; email: string }>();
  if (!user) return { ok: true };
  const token = await issueToken(db, user.id, 'reset_password', RESET_TTL);
  await sendMail(ctx.env, resetPasswordMail(user.email, `${ctx.origin}/reset-password?token=${token}`));
  await audit(db, user.id, 'account.reset_requested');
  return { ok: true };
}

export async function resetPassword(ctx: Ctx, body: { token?: unknown; password?: unknown }) {
  const db = ctx.env.DB;
  const password = typeof body.password === 'string' ? body.password : '';
  const pwErr = passwordProblem(password);
  if (pwErr) throw new HttpError(400, pwErr, 'password');
  await limit(db, `reset-confirm:ip:${ctx.ip}`, 20, 60 * MIN);
  const userId = await consumeToken(db, typeof body.token === 'string' ? body.token : '', 'reset_password');
  if (!userId) throw new HttpError(400, 'This reset link has expired or was already used. Request a new one.');
  // Resetting by email also proves the address, so mark it verified.
  await db.prepare('UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?')
    .bind(await hashPassword(password), now(), now(), userId).run();
  await destroyOtherSessions(db, userId);
  await createSession(db, ctx.cookies, userId, ctx.request.headers.get('user-agent'), ctx.secure);
  await audit(db, userId, 'account.password_reset');
}

export async function changePassword(env: Env, user: SessionUser, body: { current?: unknown; password?: unknown }) {
  const db = env.DB;
  await limit(db, `pwchange:user:${user.id}`, 10, 60 * MIN);
  const row = await db.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(typeof body.current === 'string' ? body.current : '', row.password_hash))) {
    throw new HttpError(400, 'Your current password is incorrect.', 'current');
  }
  const password = typeof body.password === 'string' ? body.password : '';
  const pwErr = passwordProblem(password);
  if (pwErr) throw new HttpError(400, pwErr, 'password');
  await db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').bind(await hashPassword(password), now(), user.id).run();
  await destroyOtherSessions(db, user.id, user.sessionId);
  await audit(db, user.id, 'account.password_changed');
}

/** Permanently deletes the account, its profiles, connections and uploaded media. */
export async function deleteAccount(env: Env, user: SessionUser, body: { password?: unknown; confirm?: unknown }) {
  const db = env.DB;
  await limit(db, `delete:user:${user.id}`, 5, 60 * MIN);
  const row = await db.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(typeof body.password === 'string' ? body.password : '', row.password_hash))) {
    throw new HttpError(400, 'Your password is incorrect.', 'password');
  }
  if (body.confirm !== 'DELETE') throw new HttpError(400, 'Type DELETE to confirm.', 'confirm');
  const media = await db.prepare('SELECT photo_key, cover_key FROM profiles WHERE owner_user_id = ?').bind(user.id).all<{ photo_key: string | null; cover_key: string | null }>();
  const gallery = await db.prepare('SELECT g.key FROM profile_gallery g JOIN profiles p ON p.id = g.profile_id WHERE p.owner_user_id = ?').bind(user.id).all<{ key: string }>();
  const keys = [...media.results.flatMap((r) => [r.photo_key, r.cover_key]), ...gallery.results.map((g) => g.key)].filter((k): k is string => !!k);
  if (keys.length) await env.MEDIA.delete(keys);
  await db.batch([
    db.prepare('DELETE FROM users WHERE id = ?').bind(user.id), // cascades to sessions, tokens, profiles, connections, blocks
    db.prepare('INSERT INTO audit_log (id, user_id, action, created_at) VALUES (?, NULL, ?, ?)').bind(randomId(), 'account.deleted', now()),
  ]);
}

export function ctxFrom(env: Env, cookies: AstroCookies, request: Request): Ctx {
  const url = new URL(request.url);
  return {
    env, cookies, request,
    ip: request.headers.get('cf-connecting-ip') ?? '0.0.0.0',
    origin: url.origin,
    secure: url.protocol === 'https:',
  };
}
