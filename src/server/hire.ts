/**
 * Hire a member (first step, no payments). A member lists a few services against their musician profile, reusing
 * the `services` table: mode 'remote' (a beat, a mix, a topline) or 'session' (in person). Prices are "from"
 * prices for display. A request carries project details and lands with the member, who accepts or declines;
 * accepting also connects the two so they can message. Price never affects ranking or discovery order.
 */
import { HttpError, audit, now, randomId, str } from './util';
import { limit } from './ratelimit';
import type { SessionUser } from './session';
import { isBlockedEitherWay } from './connections';
import { parsePrice } from './business';

export interface HireService { id: string; name: string; description: string; mode: 'session' | 'remote'; fromCents: number; currency: string; active: boolean }

const DAY = 86_400_000;
const plain = (s: string) => s.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n');

export async function listHireServices(db: D1Database, profileId: string, includeInactive = false): Promise<HireService[]> {
  const { results } = await db.prepare(`SELECT id, name, description, mode, price_cents, currency, active FROM services WHERE profile_id = ? ${includeInactive ? '' : 'AND active = 1'} ORDER BY sort, created_at`)
    .bind(profileId).all<{ id: string; name: string; description: string; mode: 'session' | 'remote'; price_cents: number; currency: string; active: number }>();
  return results.map((s) => ({ id: s.id, name: s.name, description: s.description, mode: s.mode, fromCents: s.price_cents, currency: s.currency, active: !!s.active }));
}

async function myProfile(db: D1Database, userId: string) {
  const p = await db.prepare("SELECT id, handle, status FROM profiles WHERE owner_user_id = ? AND kind = 'musician'").bind(userId).first<{ id: string; handle: string; status: string }>();
  if (!p) throw new HttpError(404, 'Set up your profile first.');
  return p;
}

export async function saveHireService(env: Env, user: SessionUser, body: { id?: unknown; name?: unknown; description?: unknown; mode?: unknown; price?: unknown; active?: unknown }) {
  const db = env.DB;
  const p = await myProfile(db, user.id);
  await limit(db, `hire-service:${user.id}`, 60, 10 * 60_000);
  const name = str(body.name, 80);
  if (!name) throw new HttpError(400, 'Name the service, for example “Custom beat”.', 'name');
  const mode = body.mode === 'session' ? 'session' : 'remote';
  const cents = parsePrice(body.price);
  if (cents === null || cents < 100) throw new HttpError(400, 'Enter a “from” price of at least $1, like 100.', 'price');
  const description = str(body.description, 300);
  const active = body.active === false ? 0 : 1;
  const t = now();
  const id = typeof body.id === 'string' && body.id ? body.id : null;
  if (id) {
    const r = await db.prepare('UPDATE services SET name=?, description=?, mode=?, price_cents=?, active=?, updated_at=? WHERE id=? AND profile_id=?').bind(name, description, mode, cents, active, t, id, p.id).run();
    if (!r.meta.changes) throw new HttpError(404, 'That service no longer exists.');
    return id;
  }
  const n = (await db.prepare('SELECT COUNT(*) AS n FROM services WHERE profile_id = ?').bind(p.id).first<{ n: number }>())?.n ?? 0;
  if (n >= 8) throw new HttpError(400, 'You can list up to 8 services.');
  const newId = randomId();
  await db.prepare(`INSERT INTO services (id, profile_id, name, description, mode, duration_min, buffer_min, price_cents, currency, active, sort, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, 0, ?, 'USD', ?, ?, ?, ?)`).bind(newId, p.id, name, description, mode, cents, active, n, t, t).run();
  return newId;
}

export async function removeHireService(env: Env, user: SessionUser, id: unknown) {
  const p = await myProfile(env.DB, user.id);
  await env.DB.prepare('UPDATE services SET active = 0, updated_at = ? WHERE id = ? AND profile_id = ?').bind(now(), String(id ?? ''), p.id).run();
}

export interface WorkRequest {
  id: string; serviceName: string; mode: 'session' | 'remote'; fromCents: number; currency: string; project: string; budget: string; deadline: string;
  status: 'requested' | 'accepted' | 'declined' | 'withdrawn'; reply: string; at: number;
  who: { handle: string | null; name: string };
}

export async function requestWork(env: Env, user: SessionUser, body: { handle?: unknown; serviceId?: unknown; project?: unknown; budget?: unknown; deadline?: unknown }) {
  const db = env.DB;
  if (!user.emailVerified) throw new HttpError(403, 'Confirm your email before sending a request.');
  await limit(db, `work-request:${user.id}`, 10, DAY);
  const target = await db.prepare("SELECT id, owner_user_id, status FROM profiles WHERE handle = ? AND kind = 'musician'").bind(str(body.handle, 40)).first<{ id: string; owner_user_id: string; status: string }>();
  if (!target || target.status !== 'published') throw new HttpError(404, 'That profile isn’t available.');
  if (target.owner_user_id === user.id) throw new HttpError(400, 'That’s your own profile.');
  if (await isBlockedEitherWay(db, user.id, target.owner_user_id)) throw new HttpError(403, 'You can’t send this request.');
  const s = await db.prepare('SELECT id, name, mode, price_cents, currency FROM services WHERE id = ? AND profile_id = ? AND active = 1').bind(str(body.serviceId, 40), target.id)
    .first<{ id: string; name: string; mode: 'session' | 'remote'; price_cents: number; currency: string }>();
  if (!s) throw new HttpError(404, 'That service isn’t available.', 'serviceId');
  const project = plain(str(body.project, 1500));
  if (project.length < 10) throw new HttpError(400, 'Tell them a little about the project (a sentence or two).', 'project');
  const open = await db.prepare("SELECT COUNT(*) AS n FROM work_requests WHERE requester_user_id = ? AND profile_id = ? AND status = 'requested'").bind(user.id, target.id).first<{ n: number }>();
  if ((open?.n ?? 0) >= 2) throw new HttpError(409, 'You already have requests waiting with this member.');
  const id = randomId();
  const t = now();
  await db.prepare(`INSERT INTO work_requests (id, profile_id, owner_user_id, requester_user_id, service_id, service_name, mode, from_price_cents, currency, project, budget_note, deadline_note, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?)`)
    .bind(id, target.id, target.owner_user_id, user.id, s.id, s.name, s.mode, s.price_cents, s.currency, project, plain(str(body.budget, 120)), plain(str(body.deadline, 120)), t, t).run();
  await audit(db, user.id, 'work.requested', { id });
  return { id };
}

const mapRow = (r: Record<string, unknown>, who: WorkRequest['who']): WorkRequest => ({
  id: r.id as string, serviceName: r.service_name as string, mode: r.mode as 'session' | 'remote', fromCents: r.from_price_cents as number, currency: r.currency as string,
  project: r.project as string, budget: r.budget_note as string, deadline: r.deadline_note as string, status: r.status as WorkRequest['status'], reply: r.reply_note as string, at: r.created_at as number, who,
});

/** Requests sent to this member (newest first), with who asked. */
export async function incomingWork(db: D1Database, userId: string): Promise<WorkRequest[]> {
  const { results } = await db.prepare(`SELECT w.*, p.handle AS h, p.display_name AS dn FROM work_requests w
      LEFT JOIN profiles p ON p.owner_user_id = w.requester_user_id AND p.kind = 'musician'
      WHERE w.owner_user_id = ? ORDER BY (w.status = 'requested') DESC, w.created_at DESC LIMIT 100`).bind(userId).all<Record<string, unknown>>();
  return results.map((r) => mapRow(r, { handle: (r.h as string) ?? null, name: (r.dn as string) ?? 'An Opus member' }));
}

/** Requests this member sent, with who they asked. */
export async function outgoingWork(db: D1Database, userId: string): Promise<WorkRequest[]> {
  const { results } = await db.prepare(`SELECT w.*, p.handle AS h, p.display_name AS dn FROM work_requests w JOIN profiles p ON p.id = w.profile_id
      WHERE w.requester_user_id = ? ORDER BY w.created_at DESC LIMIT 100`).bind(userId).all<Record<string, unknown>>();
  return results.map((r) => mapRow(r, { handle: r.h as string, name: r.dn as string }));
}

export async function respondWork(env: Env, user: SessionUser, id: string, action: unknown, replyRaw?: unknown) {
  const db = env.DB;
  const w = await db.prepare('SELECT id, owner_user_id, requester_user_id, status FROM work_requests WHERE id = ?').bind(id).first<{ id: string; owner_user_id: string; requester_user_id: string; status: string }>();
  if (!w) throw new HttpError(404, 'Request not found.');
  const t = now();
  if (action === 'withdraw') {
    if (w.requester_user_id !== user.id || w.status !== 'requested') throw new HttpError(400, 'This request can’t be withdrawn.');
    await db.prepare("UPDATE work_requests SET status = 'withdrawn', updated_at = ? WHERE id = ? AND status = 'requested'").bind(t, id).run();
  } else if (action === 'accept' || action === 'decline') {
    if (w.owner_user_id !== user.id || w.status !== 'requested') throw new HttpError(400, 'This request can’t be answered.');
    const reply = plain(str(replyRaw, 500));
    if (!(await db.prepare('UPDATE work_requests SET status = ?, reply_note = ?, updated_at = ? WHERE id = ? AND status = \'requested\'').bind(action === 'accept' ? 'accepted' : 'declined', reply, t, id).run()).meta.changes) throw new HttpError(409, 'Already answered.');
    if (action === 'accept') {
      // Agreeing to work together connects the two, so they can message each other. No-op if already connected or blocked.
      if (!(await isBlockedEitherWay(db, w.owner_user_id, w.requester_user_id))) {
        await db.prepare("INSERT INTO connections (id, requester_id, addressee_id, message, status, created_at, responded_at) VALUES (?, ?, ?, 'Work request accepted.', 'accepted', ?, ?) ON CONFLICT DO NOTHING")
          .bind(randomId(), w.requester_user_id, w.owner_user_id, t, t).run();
        await db.prepare("UPDATE connections SET status = 'accepted', responded_at = ? WHERE status = 'pending' AND ((requester_id = ?1 AND addressee_id = ?2) OR (requester_id = ?2 AND addressee_id = ?1))").bind(t, w.owner_user_id, w.requester_user_id).run();
      }
    }
  } else throw new HttpError(400, 'Unknown action.');
  await audit(db, user.id, `work.${action}`, { id });
}
