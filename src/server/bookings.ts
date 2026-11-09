/**
 * Opus Bookings, Phase 2: request-to-book without payments.
 *
 * Rules:
 * - Times and prices come from the database, never from the request.
 * - A requested time is held with one row per 15-minute cell in booking_slots. The insert runs in the
 *   same D1 batch (a transaction) as the booking, so two people can never hold the same time.
 * - Unanswered requests lapse (48 h, or at the start time) and release their time.
 * - Every state change writes a booking_events row. Nothing changes a booking silently.
 * - Payments arrive in Phase 3. Until then an accepted request is not a paid booking.
 */
import { HttpError, isEmail, now, randomId, sha256, str } from './util';
import { limit } from './ratelimit';
import { sendMail, noticeMail } from './email';
import type { SessionUser } from './session';
import { getPublicStudio, getRules, getClosedDays, listServices, defaultRoom, getStudioById, type Studio, type Service } from './business';
import { availableSlots, cells, localDay, addDays, formatSlot, tzAbbr, money, SLOT_MS, DAY_MS, isDay } from '@/lib/booking-time';

const HOUR = 3_600_000;
const REQUEST_TTL = 48 * HOUR;
const REMOTE_TTL = 72 * HOUR;

export type BookingStatus = 'requested' | 'accepted' | 'declined' | 'cancelled' | 'expired';
export const STATUS_LABEL: Record<BookingStatus, string> = {
  requested: 'Waiting for the studio', accepted: 'Accepted', declined: 'Declined', cancelled: 'Cancelled', expired: 'Expired',
};

export interface BookingRow {
  id: string; ref: string; profile_id: string; service_id: string | null; room_id: string | null; customer_id: string; user_id: string | null;
  service_name: string; mode: 'session' | 'remote'; start_at: number | null; end_at: number | null; timezone: string; price_cents: number; currency: string;
  status: BookingStatus; cancelled_by: 'customer' | 'business' | null; customer_message: string; business_note: string; source: string;
  manage_token_hash: string; expires_at: number | null; created_at: number; updated_at: number;
}
export interface BookingView extends Omit<BookingRow, 'manage_token_hash'> { customer_name: string; customer_email: string; customer_phone: string }

/** Lapse unanswered requests and free their time. Cheap; called before any read that shows availability or bookings. */
export async function expireStale(db: D1Database, profileId?: string) {
  const t = now();
  const where = `status = 'requested' AND expires_at IS NOT NULL AND expires_at < ?${profileId ? ' AND profile_id = ?' : ''}`;
  const args = profileId ? [t, profileId] : [t];
  const { results } = await db.prepare(`SELECT id FROM bookings WHERE ${where} LIMIT 200`).bind(...args).all<{ id: string }>();
  if (!results.length) return;
  const stmts: D1PreparedStatement[] = [];
  for (const { id } of results) {
    stmts.push(db.prepare("UPDATE bookings SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'requested'").bind(t, id));
    stmts.push(db.prepare('DELETE FROM booking_slots WHERE booking_id = ?').bind(id));
    stmts.push(db.prepare("INSERT INTO booking_events (id, booking_id, actor, action, created_at) VALUES (?, ?, 'system', 'expired', ?)").bind(randomId(), id, t));
  }
  await db.batch(stmts);
}

async function takenCells(db: D1Database, roomId: string, from: number, to: number) {
  const { results } = await db.prepare('SELECT slot_start FROM booking_slots WHERE room_id = ? AND slot_start >= ? AND slot_start < ?').bind(roomId, from, to).all<{ slot_start: number }>();
  return new Set(results.map((r) => r.slot_start));
}

/** Open start times for a service, day by day, in the studio's time zone. */
export async function openSlots(env: Env, studio: Studio, service: Service, fromDay: string | null, days = 14) {
  const db = env.DB;
  await expireStale(db, studio.id);
  const t = now();
  const today = localDay(t, studio.timezone);
  const start = fromDay && isDay(fromDay) && fromDay >= today ? fromDay : today;
  const span = Math.min(Math.max(days, 1), 31);
  const roomId = service.roomId ?? (await defaultRoom(db, studio.id));
  const [rules, closed] = await Promise.all([getRules(db, studio.id), getClosedDays(db, studio.id)]);
  const fromTs = Date.parse(`${start}T00:00:00Z`) - 2 * DAY_MS;
  const taken = await takenCells(db, roomId, fromTs, fromTs + (span + 4) * DAY_MS);
  const slots = availableSlots({
    tz: studio.timezone, rules, closedDays: new Set(closed.map((c) => c.day)), taken,
    durationMin: service.durationMin, bufferMin: service.bufferMin, minNoticeHours: studio.minNoticeHours,
    maxDaysAhead: studio.maxDaysAhead, now: t, fromDay: start, days: span,
  });
  return { roomId, today, from: start, next: addDays(start, span), slots };
}

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newRef() {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return 'OPU-' + [...b].map((x) => REF_ALPHABET[x % REF_ALPHABET.length]).join('');
}

export interface RequestInput {
  handle?: unknown; serviceId?: unknown; start?: unknown; name?: unknown; email?: unknown; phone?: unknown; message?: unknown; source?: unknown;
}

export async function requestBooking(env: Env, viewer: SessionUser | null, ip: string, origin: string, body: RequestInput) {
  const db = env.DB;
  await limit(db, `book:ip:${ip}`, 20, HOUR);
  const studio = await getPublicStudio(db, str(body.handle, 60), null);
  if (!studio || studio.status !== 'published') throw new HttpError(404, 'This studio isn’t taking bookings right now.');
  if (viewer && viewer.id === studio.ownerUserId) throw new HttpError(400, 'You can’t book your own studio. Add manual bookings from your dashboard later.');
  const service = (await listServices(db, studio.id)).find((s) => s.id === body.serviceId);
  if (!service) throw new HttpError(400, 'Choose one of the studio’s services.', 'serviceId');

  const name = str(body.name, 80);
  const email = viewer ? viewer.email : str(body.email, 254).toLowerCase();
  const phone = str(body.phone, 30).replace(/[^\d+()\-.\s]/g, '');
  const message = str(body.message, 1000);
  if (name.length < 2) throw new HttpError(400, 'Add your name.', 'name');
  if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email so the studio can reply.', 'email');
  if (studio.studioType === 'home' && message.length < 20) {
    throw new HttpError(400, 'Home studios ask for a short note about your session (20 characters or more).', 'message');
  }
  await limit(db, `book:email:${email}`, 6, HOUR);

  const t = now();
  let startAt: number | null = null, endAt: number | null = null, roomId: string | null = null, holds: number[] = [];
  if (service.mode === 'session') {
    startAt = Number(body.start);
    if (!Number.isInteger(startAt)) throw new HttpError(400, 'Choose a time.', 'start');
    const day = localDay(startAt, studio.timezone);
    const open = await openSlots(env, studio, service, day, 1);
    if (!open.slots[0]?.starts.includes(startAt)) throw new HttpError(409, 'That time is no longer available. Please choose another.', 'start');
    roomId = open.roomId;
    endAt = startAt + service.durationMin * 60_000;
    holds = cells(startAt, service.durationMin + service.bufferMin);
  }

  // The business's customer record (one per email per business), written in the same transaction as the booking.
  const custStmt = db.prepare(`INSERT INTO customers (id, profile_id, user_id, name, email, phone, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (profile_id, email) DO UPDATE SET name = excluded.name, phone = CASE WHEN excluded.phone <> '' THEN excluded.phone ELSE customers.phone END,
      user_id = COALESCE(customers.user_id, excluded.user_id), last_seen_at = excluded.last_seen_at
`).bind(randomId(), studio.id, viewer?.id ?? null, name, email, phone, t, t);

  const id = randomId();
  const ref = newRef();
  const token = randomId(24);
  const source = body.source === 'directory' ? 'directory' : body.source === 'link' ? 'link' : 'direct';
  const expiresAt = service.mode === 'session' ? Math.min(t + REQUEST_TTL, startAt!) : t + REMOTE_TTL;
  const stmts = [
    custStmt,
    db.prepare(`INSERT INTO bookings (id, ref, profile_id, service_id, room_id, customer_id, user_id, service_name, mode, start_at, end_at, timezone,
      price_cents, currency, status, customer_message, source, manage_token_hash, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, (SELECT id FROM customers WHERE profile_id = ? AND email = ?), ?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?, ?, ?, ?, ?)`)
      .bind(id, ref, studio.id, service.id, roomId, studio.id, email, viewer?.id ?? null, service.name, service.mode, startAt, endAt, studio.timezone,
        service.priceCents, service.currency, message, source, await sha256(token), expiresAt, t, t),
    ...holds.map((c) => db.prepare('INSERT INTO booking_slots (room_id, slot_start, booking_id) VALUES (?, ?, ?)').bind(roomId, c, id)),
    db.prepare("INSERT INTO booking_events (id, booking_id, actor, user_id, action, created_at) VALUES (?, ?, 'customer', ?, 'requested', ?)").bind(randomId(), id, viewer?.id ?? null, t),
  ];
  try {
    await db.batch(stmts);
  } catch (e) {
    if (/UNIQUE|constraint/i.test(String(e))) throw new HttpError(409, 'Someone just requested that time. Please choose another.', 'start');
    throw e;
  }

  const when = startAt ? `${formatSlot(startAt, studio.timezone)} ${tzAbbr(startAt, studio.timezone)}` : 'Remote project';
  const manageUrl = `${origin}/bookings/${id}?t=${token}`;
  const owner = await db.prepare('SELECT email FROM users WHERE id = ?').bind(studio.ownerUserId).first<{ email: string }>();
  await Promise.allSettled([
    sendMail(env, noticeMail(email, `Request sent to ${studio.name} · ${ref}`, 'Your request is in',
      `${studio.name} has your request for ${service.name} (${when}, ${money(service.priceCents, service.currency)}). They have 48 hours to reply. Nothing has been charged. Reference ${ref}.`,
      'View or cancel your request', manageUrl, 'Keep this email: the link lets you check or cancel your request without an account.')),
    owner && sendMail(env, noticeMail(owner.email, `New booking request · ${service.name} · ${ref}`, 'You have a new booking request',
      `${name} asked for ${service.name} (${when}). The time is held for 48 hours or until you reply.${message ? ` Their note: “${message.slice(0, 300)}”` : ''}`,
      'Review the request', `${origin}/business/bookings`)),
  ]);
  return { id, ref, manageUrl, status: 'requested' as const, when };
}

// ---------- reading ----------
const VIEW_SELECT = `SELECT b.*, c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone FROM bookings b JOIN customers c ON c.id = b.customer_id`;

export async function listBusinessBookings(db: D1Database, profileId: string) {
  await expireStale(db, profileId);
  const { results } = await db.prepare(`${VIEW_SELECT} WHERE b.profile_id = ? ORDER BY CASE b.status WHEN 'requested' THEN 0 WHEN 'accepted' THEN 1 ELSE 2 END, COALESCE(b.start_at, b.created_at) LIMIT 300`)
    .bind(profileId).all<BookingRow & { customer_name: string; customer_email: string; customer_phone: string }>();
  return results.map(({ manage_token_hash: _x, ...v }) => v as BookingView);
}

export async function listCustomers(db: D1Database, profileId: string) {
  const { results } = await db.prepare(`SELECT c.id, c.name, c.email, c.phone, c.created_at, c.last_seen_at,
      (SELECT COUNT(*) FROM bookings b WHERE b.customer_id = c.id) AS requests,
      (SELECT COUNT(*) FROM bookings b WHERE b.customer_id = c.id AND b.status = 'accepted') AS accepted
    FROM customers c WHERE c.profile_id = ? ORDER BY c.last_seen_at DESC LIMIT 500`).bind(profileId)
    .all<{ id: string; name: string; email: string; phone: string; created_at: number; last_seen_at: number; requests: number; accepted: number }>();
  return results;
}

export async function listMyBookings(db: D1Database, userId: string) {
  await expireStale(db);
  const { results } = await db.prepare(`SELECT b.id, b.ref, b.service_name, b.mode, b.start_at, b.timezone, b.price_cents, b.currency, b.status, b.created_at,
      p.display_name AS studio_name, p.handle AS studio_handle
    FROM bookings b JOIN profiles p ON p.id = b.profile_id WHERE b.user_id = ? ORDER BY b.created_at DESC LIMIT 100`).bind(userId)
    .all<{ id: string; ref: string; service_name: string; mode: string; start_at: number | null; timezone: string; price_cents: number; currency: string; status: BookingStatus; created_at: number; studio_name: string; studio_handle: string }>();
  return results;
}

/** A guest opens their booking with the private link; a signed-in customer with their account. */
export async function getBookingForCustomer(db: D1Database, id: string, token: string | null, viewer: SessionUser | null) {
  await expireStale(db);
  const b = await db.prepare(`${VIEW_SELECT} WHERE b.id = ?`).bind(id).first<BookingRow & { customer_name: string; customer_email: string; customer_phone: string }>();
  if (!b) return null;
  const byToken = token ? (await sha256(token)) === b.manage_token_hash : false;
  const byUser = !!viewer && viewer.id === b.user_id;
  if (!byToken && !byUser) return null;
  const studio = await getStudioById(db, b.profile_id);
  const { manage_token_hash: _x, ...view } = b;
  return { booking: view as BookingView, studio: studio && { name: studio.name, handle: studio.handle, timezone: studio.timezone, cancellationPolicy: studio.cancellationPolicy, studioType: studio.studioType } };
}

// ---------- state changes ----------
async function transition(db: D1Database, b: BookingRow, to: BookingStatus, actor: 'customer' | 'business', userId: string | null, note: string) {
  const t = now();
  const release = to !== 'accepted';
  const res = await db.batch([
    db.prepare(`UPDATE bookings SET status = ?, cancelled_by = ?, business_note = CASE WHEN ? <> '' THEN ? ELSE business_note END, expires_at = NULL, updated_at = ?
      WHERE id = ? AND status = ?`).bind(to, to === 'cancelled' ? actor : null, actor === 'business' ? note : '', note, t, b.id, b.status),
    ...(release ? [db.prepare('DELETE FROM booking_slots WHERE booking_id = ?').bind(b.id)] : []),
    db.prepare('INSERT INTO booking_events (id, booking_id, actor, user_id, action, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(randomId(), b.id, actor, userId, to, note, t),
  ]);
  // The guarded UPDATE matched nothing: someone else changed the booking first.
  if (!res[0]!.meta.changes) throw new HttpError(409, 'This booking changed in the meantime. Refresh to see its current state.');
}

const ALLOWED: Record<string, { from: BookingStatus[]; to: BookingStatus }> = {
  accept: { from: ['requested'], to: 'accepted' },
  decline: { from: ['requested'], to: 'declined' },
  cancel: { from: ['accepted'], to: 'cancelled' },
};

export async function actAsBusiness(env: Env, user: SessionUser, id: string, action: unknown, noteIn: unknown, origin: string) {
  const db = env.DB;
  const rule = ALLOWED[String(action)];
  if (!rule) throw new HttpError(400, 'Unknown action.');
  await expireStale(db);
  const b = await db.prepare(`SELECT b.* FROM bookings b JOIN profiles p ON p.id = b.profile_id WHERE b.id = ? AND p.owner_user_id = ?`).bind(id, user.id).first<BookingRow>();
  if (!b) throw new HttpError(404, 'Booking not found.');
  if (!rule.from.includes(b.status)) throw new HttpError(409, `This booking is ${STATUS_LABEL[b.status].toLowerCase()} and can’t be changed that way.`);
  if (rule.to === 'accepted' && b.start_at && b.start_at < now()) throw new HttpError(409, 'That time has already passed.');
  const note = str(noteIn, 500);
  if (rule.to === 'cancelled' && note.length < 5) throw new HttpError(400, 'Tell the customer why you’re cancelling.', 'note');
  await transition(db, b, rule.to, 'business', user.id, note);

  const studio = await getStudioById(db, b.profile_id);
  const cust = await db.prepare('SELECT email, name FROM customers WHERE id = ?').bind(b.customer_id).first<{ email: string; name: string }>();
  if (cust && studio) {
    const when = b.start_at ? `${formatSlot(b.start_at, b.timezone)} ${tzAbbr(b.start_at, b.timezone)}` : 'your remote project';
    const words = {
      accepted: ['accepted your request', `${studio.name} accepted ${b.service_name} for ${when}. Online payment isn’t switched on yet, so the studio will confirm how to pay.`],
      declined: ['declined your request', `${studio.name} can’t take ${b.service_name} for ${when}. The time has been released. You can request another time.`],
      cancelled: ['cancelled your session', `${studio.name} cancelled ${b.service_name} for ${when}.`],
    }[rule.to as 'accepted' | 'declined' | 'cancelled'];
    await sendMail(env, noticeMail(cust.email, `${studio.name} ${words[0]} · ${b.ref}`, `${studio.name} ${words[0]}`,
      `${words[1]}${note ? ` Note from the studio: “${note}”` : ''}`, rule.to === 'declined' ? 'Choose another time' : 'View the studio',
      `${origin}/studios/${studio.handle}`)).catch(() => undefined);
  }
  return { status: rule.to };
}

export async function cancelAsCustomer(env: Env, id: string, token: string | null, viewer: SessionUser | null, origin: string) {
  const db = env.DB;
  const found = await getBookingForCustomer(db, id, token, viewer);
  if (!found) throw new HttpError(404, 'Booking not found.');
  const b = found.booking as unknown as BookingRow;
  if (b.status !== 'requested' && b.status !== 'accepted') throw new HttpError(409, `This booking is already ${STATUS_LABEL[b.status].toLowerCase()}.`);
  if (b.start_at && b.start_at < now()) throw new HttpError(409, 'This session has already started.');
  await transition(db, b, 'cancelled', 'customer', viewer?.id ?? null, '');
  const owner = await db.prepare('SELECT u.email FROM users u JOIN profiles p ON p.owner_user_id = u.id WHERE p.id = ?').bind(b.profile_id).first<{ email: string }>();
  if (owner) {
    const when = b.start_at ? `${formatSlot(b.start_at, b.timezone)} ${tzAbbr(b.start_at, b.timezone)}` : 'a remote project';
    await sendMail(env, noticeMail(owner.email, `Booking cancelled by the customer · ${b.ref}`, 'A customer cancelled',
      `${found.booking.customer_name} cancelled ${b.service_name} (${when}). The time is open again.`, 'Open your dashboard', `${origin}/business/bookings`)).catch(() => undefined);
  }
  return { status: 'cancelled' as const };
}

export { SLOT_MS };
