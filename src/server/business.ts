/**
 * Opus Business, Phase 2: studio profiles, services, availability.
 * Every write checks that the signed-in user owns the studio. Public reads never include
 * the private address, customer data or internal notes.
 */
import { HttpError, audit, now, randomId, str } from './util';
import { limit } from './ratelimit';
import { RESERVED, cleanUrl, slugify, mediaUrl } from './profiles';
import type { SessionUser } from './session';
import { isDay, isTimeZone } from '@/lib/booking-time';

export type StudioType = 'commercial' | 'home' | 'remote';
export const STUDIO_TYPES: Record<StudioType, { label: string; hint: string }> = {
  commercial: { label: 'Commercial studio', hint: 'A dedicated studio space open to clients.' },
  home: { label: 'Home studio', hint: 'A studio in a private residence. Your address stays private; requests need your approval.' },
  remote: { label: 'Remote services', hint: 'Mixing, mastering, production or editing delivered online. No visits.' },
};

export interface Studio {
  id: string; handle: string; name: string; studioType: StudioType; placeId: string | null; bio: string;
  photoKey: string | null; coverKey: string | null; status: 'draft' | 'published' | 'hidden'; showOnMap: boolean;
  equipment: string[]; website: string; instagram: string;
  timezone: string; bookingMode: 'request' | 'instant'; minNoticeHours: number; maxDaysAhead: number;
  bookingPolicy: string; cancellationPolicy: string; verification: string; ownerUserId: string; updatedAt: number;
}
/** Only for the owner. */
export interface StudioPrivate extends Studio { privateAddress: string }

export interface Service {
  id: string; name: string; description: string; mode: 'session' | 'remote'; durationMin: number; bufferMin: number;
  priceCents: number; currency: string; active: boolean; sort: number; roomId: string | null;
}
export interface Rule { weekday: number; start_min: number; end_min: number }

interface StudioRow {
  id: string; handle: string; display_name: string; bio: string; place_id: string | null; photo_key: string | null; cover_key: string | null;
  status: Studio['status']; show_on_map: number; links: string; verification: string; owner_user_id: string; updated_at: number;
  studio_type: string; equipment: string; private_address: string | null; timezone: string; booking_mode: 'request' | 'instant';
  min_notice_hours: number; max_days_ahead: number; booking_policy: string; cancellation_policy: string; studio_verification: string;
}

const parse = <T>(s: string | null, f: T): T => { try { return s ? (JSON.parse(s) as T) : f; } catch { return f; } };

function toStudio(r: StudioRow): StudioPrivate {
  const links = parse<Record<string, string>>(r.links, {});
  const pa = parse<{ text?: string }>(r.private_address, {});
  return {
    id: r.id, handle: r.handle, name: r.display_name, studioType: (r.studio_type as StudioType) ?? 'commercial', placeId: r.place_id, bio: r.bio,
    photoKey: r.photo_key, coverKey: r.cover_key, status: r.status, showOnMap: r.show_on_map !== 0,
    equipment: parse(r.equipment, []), website: links.website ?? '', instagram: links.instagram ?? '',
    timezone: r.timezone, bookingMode: r.booking_mode, minNoticeHours: r.min_notice_hours, maxDaysAhead: r.max_days_ahead,
    bookingPolicy: r.booking_policy, cancellationPolicy: r.cancellation_policy, verification: r.studio_verification,
    ownerUserId: r.owner_user_id, updatedAt: r.updated_at, privateAddress: pa.text ?? '',
  };
}

const STUDIO_SELECT = `SELECT p.*, d.studio_type, d.equipment, d.private_address, d.timezone, d.booking_mode, d.min_notice_hours,
  d.max_days_ahead, d.booking_policy, d.cancellation_policy, d.studio_verification
  FROM profiles p JOIN studio_details d ON d.profile_id = p.id`;

export async function getMyStudio(db: D1Database, userId: string): Promise<StudioPrivate | null> {
  const r = await db.prepare(`${STUDIO_SELECT} WHERE p.owner_user_id = ? AND p.kind = 'studio' ORDER BY p.created_at LIMIT 1`).bind(userId).first<StudioRow>();
  return r ? toStudio(r) : null;
}

/** Public studio by handle. Drafts are visible only to their owner. The private address is removed. */
export async function getPublicStudio(db: D1Database, handle: string, viewerId: string | null): Promise<Studio | null> {
  const r = await db.prepare(`${STUDIO_SELECT} WHERE p.handle = ? AND p.kind = 'studio'`).bind(handle).first<StudioRow>();
  if (!r) return null;
  if (r.status !== 'published' && r.owner_user_id !== viewerId) return null;
  const { privateAddress: _drop, ...pub } = toStudio(r);
  return pub;
}

export async function getStudioById(db: D1Database, id: string) {
  const r = await db.prepare(`${STUDIO_SELECT} WHERE p.id = ? AND p.kind = 'studio'`).bind(id).first<StudioRow>();
  return r ? toStudio(r) : null;
}

export async function listServices(db: D1Database, profileId: string, includeInactive = false): Promise<Service[]> {
  const { results } = await db.prepare(`SELECT * FROM services WHERE profile_id = ? ${includeInactive ? '' : 'AND active = 1'} ORDER BY sort, created_at`).bind(profileId)
    .all<{ id: string; name: string; description: string; mode: Service['mode']; duration_min: number; buffer_min: number; price_cents: number; currency: string; active: number; sort: number; room_id: string | null }>();
  return results.map((s) => ({ id: s.id, name: s.name, description: s.description, mode: s.mode, durationMin: s.duration_min, bufferMin: s.buffer_min, priceCents: s.price_cents, currency: s.currency, active: !!s.active, sort: s.sort, roomId: s.room_id }));
}

export async function getRules(db: D1Database, profileId: string): Promise<Rule[]> {
  const { results } = await db.prepare('SELECT weekday, start_min, end_min FROM availability_rules WHERE profile_id = ? ORDER BY weekday, start_min').bind(profileId).all<Rule>();
  return results;
}
export async function getClosedDays(db: D1Database, profileId: string): Promise<{ day: string; note: string }[]> {
  const { results } = await db.prepare('SELECT day, note FROM availability_exceptions WHERE profile_id = ? ORDER BY day').bind(profileId).all<{ day: string; note: string }>();
  return results;
}
export async function defaultRoom(db: D1Database, profileId: string) {
  const r = await db.prepare('SELECT id FROM rooms WHERE profile_id = ? AND active = 1 ORDER BY sort, created_at LIMIT 1').bind(profileId).first<{ id: string }>();
  if (r) return r.id;
  const id = randomId();
  await db.prepare('INSERT INTO rooms (id, profile_id, name, created_at) VALUES (?, ?, ?, ?)').bind(id, profileId, 'Main room', now()).run();
  return id;
}

/** What's still missing before a studio's booking page can go live. */
export async function studioChecklist(db: D1Database, s: Studio, emailVerified: boolean) {
  const services = await listServices(db, s.id);
  const rules = await getRules(db, s.id);
  const needsHours = services.some((x) => x.mode === 'session');
  const steps = [
    { key: 'email', label: 'Confirm your email address', done: emailVerified, href: '/account' },
    { key: 'details', label: 'Studio name, type, city and a description (40+ characters)', done: !!(s.name && s.placeId && s.bio.trim().length >= 40), href: '/business/studio' },
    { key: 'photo', label: 'A main photo of the studio', done: !!s.photoKey, href: '/business/studio#photos' },
    { key: 'services', label: 'At least one service with a price', done: services.length > 0, href: '/business/services' },
    { key: 'hours', label: 'Weekly hours for booking sessions', done: !needsHours || rules.length > 0, href: '/business/hours' },
  ];
  return { steps, ready: steps.every((x) => x.done), services, rules };
}

// ---------- writes ----------
export interface StudioInput {
  name?: unknown; handle?: unknown; studioType?: unknown; placeId?: unknown; bio?: unknown; equipment?: unknown;
  website?: unknown; instagram?: unknown; privateAddress?: unknown; timezone?: unknown; minNoticeHours?: unknown;
  maxDaysAhead?: unknown; bookingPolicy?: unknown; cancellationPolicy?: unknown; showOnMap?: unknown; publish?: unknown;
}

const intIn = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

export async function saveStudio(env: Env, user: SessionUser, body: StudioInput) {
  const db = env.DB;
  await limit(db, `studio-save:${user.id}`, 60, 10 * 60_000);
  const existing = await getMyStudio(db, user.id);

  const name = str(body.name, 80);
  if (!name) throw new HttpError(400, 'Add your studio’s name.', 'name');
  const studioType = (Object.keys(STUDIO_TYPES) as StudioType[]).includes(body.studioType as StudioType) ? (body.studioType as StudioType) : null;
  if (!studioType) throw new HttpError(400, 'Choose what kind of studio this is.', 'studioType');
  const placeId = str(body.placeId, 80) || null;
  if (placeId && !(await db.prepare('SELECT 1 FROM places WHERE id = ?').bind(placeId).first())) throw new HttpError(400, 'Choose a city from the list.', 'placeId');
  const bio = str(body.bio, 2000);
  const equipment = (Array.isArray(body.equipment) ? body.equipment : String(body.equipment ?? '').split('\n'))
    .map((e) => str(e, 80)).filter(Boolean).slice(0, 40);
  const website = cleanUrl(body.website, null);
  const instagram = cleanUrl(body.instagram, ['instagram.com']);
  const privateAddress = str(body.privateAddress, 300);
  const timezone = str(body.timezone, 60) || existing?.timezone || 'America/Chicago';
  if (!isTimeZone(timezone)) throw new HttpError(400, 'Choose a valid time zone.', 'timezone');
  const minNoticeHours = intIn(body.minNoticeHours, 0, 24 * 14, 24);
  const maxDaysAhead = intIn(body.maxDaysAhead, 1, 365, 60);
  const bookingPolicy = str(body.bookingPolicy, 1500);
  const cancellationPolicy = str(body.cancellationPolicy, 1500);
  const showOnMap = body.showOnMap === false ? 0 : 1;

  let handle = slugify(str(body.handle, 40)) || existing?.handle || slugify(name) || 'studio';
  if (handle.length < 3) handle = `${handle}-studio`;
  if (RESERVED.has(handle)) throw new HttpError(400, 'That page address is reserved. Try another.', 'handle');
  const taken = await db.prepare('SELECT id FROM profiles WHERE handle = ?').bind(handle).first<{ id: string }>();
  if (taken && taken.id !== existing?.id) {
    if (str(body.handle, 40)) throw new HttpError(409, 'That page address is taken. Try another.', 'handle');
    handle = `${handle}-${randomId(3).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  }

  const t = now();
  const id = existing?.id ?? randomId();
  const links = JSON.stringify({ ...(website ? { website } : {}), ...(instagram ? { instagram } : {}) });
  const pa = privateAddress ? JSON.stringify({ text: privateAddress }) : null;
  const stmts: D1PreparedStatement[] = [];
  if (existing) {
    stmts.push(db.prepare('UPDATE profiles SET handle=?, display_name=?, bio=?, place_id=?, show_on_map=?, links=?, updated_at=? WHERE id=? AND owner_user_id=?')
      .bind(handle, name, bio, placeId, showOnMap, links, t, id, user.id));
    stmts.push(db.prepare(`UPDATE studio_details SET studio_type=?, equipment=?, private_address=?, timezone=?, min_notice_hours=?, max_days_ahead=?,
      booking_policy=?, cancellation_policy=?, accepts_booking_requests=1 WHERE profile_id=?`)
      .bind(studioType, JSON.stringify(equipment), pa, timezone, minNoticeHours, maxDaysAhead, bookingPolicy, cancellationPolicy, id));
  } else {
    stmts.push(db.prepare(`INSERT INTO profiles (id, kind, owner_user_id, handle, display_name, bio, place_id, show_on_map, links, status, created_at, updated_at)
      VALUES (?, 'studio', ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`).bind(id, user.id, handle, name, bio, placeId, showOnMap, links, t, t));
    stmts.push(db.prepare(`INSERT INTO studio_details (profile_id, studio_type, equipment, private_address, timezone, min_notice_hours, max_days_ahead,
      booking_policy, cancellation_policy, accepts_booking_requests) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`)
      .bind(id, studioType, JSON.stringify(equipment), pa, timezone, minNoticeHours, maxDaysAhead, bookingPolicy, cancellationPolicy));
    stmts.push(db.prepare('INSERT INTO rooms (id, profile_id, name, created_at) VALUES (?, ?, ?, ?)').bind(randomId(), id, 'Main room', t));
  }
  await db.batch(stmts);
  if (!existing) await audit(db, user.id, 'studio.created', { id });

  let studio = (await getMyStudio(db, user.id))!;
  if (body.publish === true || body.publish === false) studio = await setStudioPublished(env, user, studio, body.publish === true);
  return studio;
}

export async function setStudioPublished(env: Env, user: SessionUser, studio: StudioPrivate, publish: boolean) {
  if (publish) {
    const { steps, ready } = await studioChecklist(env.DB, studio, user.emailVerified);
    if (!ready) throw new HttpError(400, `Saved. To publish, finish: ${steps.filter((s) => !s.done).map((s) => s.label.toLowerCase()).join('; ')}.`);
  }
  const status = publish ? 'published' : 'draft';
  if (status !== studio.status) {
    await env.DB.prepare('UPDATE profiles SET status = ?, updated_at = ? WHERE id = ? AND owner_user_id = ?').bind(status, now(), studio.id, user.id).run();
    await audit(env.DB, user.id, publish ? 'studio.published' : 'studio.unpublished', { id: studio.id });
  }
  return { ...studio, status } as StudioPrivate;
}

async function ownedStudio(env: Env, user: SessionUser) {
  const s = await getMyStudio(env.DB, user.id);
  if (!s) throw new HttpError(404, 'Set up your studio first.');
  return s;
}

export interface ServiceInput { id?: unknown; name?: unknown; description?: unknown; mode?: unknown; durationMin?: unknown; bufferMin?: unknown; price?: unknown; active?: unknown }

/** Price typed as dollars ("85", "85.50", "$1,200") → cents. */
export function parsePrice(v: unknown) {
  const s = String(v ?? '').replace(/[$,\s]/g, '');
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

export async function saveService(env: Env, user: SessionUser, body: ServiceInput) {
  const db = env.DB;
  const studio = await ownedStudio(env, user);
  await limit(db, `service-save:${user.id}`, 120, 10 * 60_000);
  const name = str(body.name, 80);
  if (!name) throw new HttpError(400, 'Name the service, for example “Recording session (2 hours)”.', 'name');
  const mode = body.mode === 'remote' ? 'remote' : 'session';
  const durationMin = mode === 'session' ? Math.round(Number(body.durationMin)) : 0;
  if (mode === 'session' && (!Number.isFinite(durationMin) || durationMin < 30 || durationMin > 720 || durationMin % 15)) {
    throw new HttpError(400, 'Session length must be between 30 minutes and 12 hours, in 15-minute steps.', 'durationMin');
  }
  const bufferMin = mode === 'session' ? Math.round(Number(body.bufferMin ?? 0)) : 0;
  if (!Number.isFinite(bufferMin) || bufferMin < 0 || bufferMin > 240 || bufferMin % 15) throw new HttpError(400, 'Buffer must be 0 to 4 hours, in 15-minute steps.', 'bufferMin');
  const priceCents = parsePrice(body.price);
  if (priceCents === null || priceCents < 100) throw new HttpError(400, 'Enter a price of at least $1, like 85 or 85.50.', 'price');
  const description = str(body.description, 600);
  const active = body.active === false ? 0 : 1;
  const t = now();
  const id = typeof body.id === 'string' && body.id ? body.id : null;
  if (id) {
    const r = await db.prepare('UPDATE services SET name=?, description=?, mode=?, duration_min=?, buffer_min=?, price_cents=?, active=?, updated_at=? WHERE id=? AND profile_id=?')
      .bind(name, description, mode, durationMin, bufferMin, priceCents, active, t, id, studio.id).run();
    if (!r.meta.changes) throw new HttpError(404, 'That service no longer exists.');
    return id;
  }
  const count = await db.prepare('SELECT COUNT(*) AS n FROM services WHERE profile_id = ?').bind(studio.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= 30) throw new HttpError(400, 'A studio can list up to 30 services.');
  const newId = randomId();
  await db.prepare(`INSERT INTO services (id, profile_id, room_id, name, description, mode, duration_min, buffer_min, price_cents, currency, active, sort, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?)`)
    .bind(newId, studio.id, mode === 'session' ? await defaultRoom(db, studio.id) : null, name, description, mode, durationMin, bufferMin, priceCents, active, count?.n ?? 0, t, t).run();
  return newId;
}

/** Services are archived, not deleted, so past bookings keep their history. */
export async function archiveService(env: Env, user: SessionUser, id: unknown) {
  const studio = await ownedStudio(env, user);
  await env.DB.prepare('UPDATE services SET active = 0, updated_at = ? WHERE id = ? AND profile_id = ?').bind(now(), String(id ?? ''), studio.id).run();
  // A published studio must keep at least one service.
  if (studio.status === 'published' && (await listServices(env.DB, studio.id)).length === 0) {
    await env.DB.prepare('UPDATE services SET active = 1 WHERE id = ? AND profile_id = ?').bind(String(id ?? ''), studio.id).run();
    throw new HttpError(400, 'Your booking page is live, so it needs at least one service. Add another first, or unpublish.');
  }
}

/** Replace weekly hours and closed days in one go. Hours are "HH:MM" strings in the studio's time zone. */
export async function saveAvailability(env: Env, user: SessionUser, body: { rules?: unknown; closed?: unknown }) {
  const db = env.DB;
  const studio = await ownedStudio(env, user);
  await limit(db, `hours-save:${user.id}`, 60, 10 * 60_000);
  const toMin = (s: unknown) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? ''));
    if (!m) return null;
    const v = Number(m[1]) * 60 + Number(m[2]);
    return v >= 0 && v <= 1440 && Number(m[2]) % 15 === 0 ? v : null;
  };
  const rules: Rule[] = [];
  for (const r of (Array.isArray(body.rules) ? body.rules : []).slice(0, 28) as Record<string, unknown>[]) {
    const weekday = Number(r.weekday);
    const s = toMin(r.start), e = toMin(r.end === '00:00' ? '24:00' : r.end);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue;
    if (s === null || e === null) throw new HttpError(400, 'Use times on the quarter hour, like 10:00 or 18:30.');
    if (e <= s) throw new HttpError(400, 'Each day’s closing time must be after its opening time.');
    if (rules.some((x) => x.weekday === weekday && s < x.end_min && e > x.start_min)) throw new HttpError(400, 'Two time ranges on the same day overlap.');
    rules.push({ weekday, start_min: s, end_min: e });
  }
  const closed = [...new Set((Array.isArray(body.closed) ? body.closed : []).map((d) => String(d)).filter(isDay))].slice(0, 120);
  if (studio.status === 'published' && rules.length === 0 && (await listServices(db, studio.id)).some((x) => x.mode === 'session')) {
    throw new HttpError(400, 'Your booking page is live, so it needs at least one day of hours. Unpublish first to clear them all.');
  }
  const stmts = [
    db.prepare('DELETE FROM availability_rules WHERE profile_id = ?').bind(studio.id),
    db.prepare('DELETE FROM availability_exceptions WHERE profile_id = ?').bind(studio.id),
    ...rules.map((r) => db.prepare('INSERT INTO availability_rules (id, profile_id, weekday, start_min, end_min) VALUES (?, ?, ?, ?, ?)').bind(randomId(), studio.id, r.weekday, r.start_min, r.end_min)),
    ...closed.map((d) => db.prepare('INSERT INTO availability_exceptions (id, profile_id, day) VALUES (?, ?, ?)').bind(randomId(), studio.id, d)),
  ];
  await db.batch(stmts);
  return { rules, closed };
}

export const studioPhoto = (s: Pick<Studio, 'photoKey'>) => mediaUrl(s.photoKey);
