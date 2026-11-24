/**
 * Events: members create events, feature artists (who must accept), and save events to My Future.
 *
 * Rules enforced here, not in the pages:
 * - Only the organizer edits, cancels or invites performers to an event.
 * - An artist shows as performing only after they accept the organizer's invitation (status 'confirmed').
 *   Nobody can add themselves as a performer.
 * - Saving, Interested and Going are a member's own notes. They are never a ticket or an RSVP.
 * - Unlisted events open by link only; they never appear in Our Future or World.
 */
import { HttpError, now, randomId, str, audit } from './util';
import { limit } from './ratelimit';
import { cleanUpload, cleanUrl, getMyProfile, mediaUrl } from './profiles';
import { PLACE_BY_ID, placeLabel } from '@/data/places';
import { isDay, isTimeZone, localDay, zonedToUtc } from '@/lib/booking-time';
import { CATEGORIES, eventEndsAt, formatEventWhen, isCategory, isRelation, RELATIONS, type EventCategory, type EventRelation } from '@/lib/events';
import type { SessionUser } from './session';
import { getClan, isClanAdmin } from './clans';

const MAX_PERFORMERS = 20;
const MAX_SPAN_MS = 14 * 86_400_000;
const MAX_AHEAD_MS = 3 * 366 * 86_400_000;

interface Row {
  id: string; organizer_user_id: string; organizer_profile_id: string; title: string; description: string; category: EventCategory;
  start_at: number; end_at: number | null; timezone: string; place_id: string; venue: string; link: string | null; image_key: string | null;
  visibility: 'public' | 'unlisted'; status: 'scheduled' | 'canceled'; canceled_at: number | null; created_at: number; updated_at: number;
  org_name?: string; org_handle?: string; org_status?: string; org_photo?: string | null; org_kind?: string;
}

export interface Performer { profileId: string; handle: string; name: string; photo: string | null; status: 'invited' | 'confirmed' | 'declined' }

export interface EventView {
  id: string; title: string; description: string; category: EventCategory; categoryLabel: string;
  startAt: number; endAt: number | null; timezone: string; when: string; day: string;
  placeId: string; place: string; venue: string; link: string | null; image: string | null; imageKey: string | null;
  visibility: 'public' | 'unlisted'; status: 'scheduled' | 'canceled'; past: boolean;
  organizer: { userId: string; profileId: string; name: string; handle: string; published: boolean; photo: string | null; /** A Clan hosts (organization profile) or a member does. */ isClan: boolean; href: string };
  href: string;
}

const SELECT = `SELECT e.*, p.display_name AS org_name, p.handle AS org_handle, p.status AS org_status, p.photo_key AS org_photo, p.kind AS org_kind
  FROM events e JOIN profiles p ON p.id = e.organizer_profile_id`;

function view(r: Row, at = now()): EventView {
  const place = PLACE_BY_ID.get(r.place_id);
  return {
    id: r.id, title: r.title, description: r.description, category: r.category, categoryLabel: CATEGORIES[r.category] ?? 'Event',
    startAt: r.start_at, endAt: r.end_at, timezone: r.timezone, when: formatEventWhen(r.start_at, r.end_at, r.timezone, at), day: localDay(r.start_at, r.timezone),
    placeId: r.place_id, place: place ? placeLabel(place) : '', venue: r.venue, link: r.link, image: mediaUrl(r.image_key), imageKey: r.image_key,
    visibility: r.visibility, status: r.status, past: eventEndsAt(r.start_at, r.end_at) < at,
    organizer: { userId: r.organizer_user_id, profileId: r.organizer_profile_id, name: r.org_name ?? 'An Opus member', handle: r.org_handle ?? '', published: r.org_status === 'published', photo: mediaUrl(r.org_photo ?? null),
      isClan: r.org_kind === 'organization', href: r.org_kind === 'organization' ? `/c/${r.org_handle ?? ''}` : `/${r.org_handle ?? ''}` },
    href: `/events/${r.id}`,
  };
}

// ---------- validation ----------
interface Input { title: string; description: string; category: EventCategory; startAt: number; endAt: number | null; timezone: string; placeId: string; venue: string; link: string | null; visibility: 'public' | 'unlisted' }

const minutesOf = (t: string, field: string) => {
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new HttpError(400, 'Choose a time.', field);
  return Number(m[1]) * 60 + Number(m[2]);
};

/** Checks every field and turns the local date and time into UTC instants in the event's own time zone. */
export function validateEvent(body: Record<string, unknown>, at = now(), existingStart?: number): Input {
  const title = str(body.title, 120);
  if (title.length < 3) throw new HttpError(400, 'Give your event a title.', 'title');
  const description = str(body.description, 4000);
  const category = body.category;
  if (!isCategory(category)) throw new HttpError(400, 'Choose what kind of event it is.', 'category');
  const timezone = str(body.timezone, 64);
  if (!timezone || !isTimeZone(timezone)) throw new HttpError(400, 'Choose the event’s time zone.', 'timezone');
  const date = str(body.date, 10);
  if (!isDay(date)) throw new HttpError(400, 'Choose a date.', 'date');
  const startAt = zonedToUtc(date, minutesOf(str(body.time, 5), 'time'), timezone);
  // A new date must be in the future. An event that already started can keep its date while it is edited.
  if (startAt !== existingStart && startAt < at) throw new HttpError(400, 'Choose a date and time that hasn’t passed yet.', 'date');
  if (startAt > at + MAX_AHEAD_MS) throw new HttpError(400, 'Events can be planned up to three years ahead.', 'date');
  let endAt: number | null = null;
  const endTime = str(body.endTime, 5);
  if (endTime) {
    const endDate = str(body.endDate, 10) || date;
    if (!isDay(endDate)) throw new HttpError(400, 'Choose an end date.', 'endDate');
    endAt = zonedToUtc(endDate, minutesOf(endTime, 'endTime'), timezone);
    // An end time earlier than the start on the same day means it runs past midnight.
    if (endAt <= startAt && !str(body.endDate, 10)) endAt += 86_400_000;
    if (endAt <= startAt) throw new HttpError(400, 'The end has to be after the start.', 'endTime');
    if (endAt - startAt > MAX_SPAN_MS) throw new HttpError(400, 'Events can last up to 14 days.', 'endDate');
  }
  const placeId = str(body.placeId, 80);
  if (!PLACE_BY_ID.has(placeId)) throw new HttpError(400, 'Choose the city.', 'placeId');
  const venue = str(body.venue, 120);
  if (venue.length < 2) throw new HttpError(400, 'Add the venue or location name.', 'venue');
  let link: string | null = null;
  try { link = cleanUrl(body.link, null) || null; } catch (e) { if (e instanceof HttpError) e.field = 'link'; throw e; }
  const visibility = body.visibility === 'unlisted' ? 'unlisted' : 'public';
  return { title, description, category, startAt, endAt, timezone, placeId, venue, link, visibility };
}

// ---------- reading ----------
export async function getEvent(db: D1Database, id: string) {
  if (!id || id.length > 40) return null;
  const r = await db.prepare(`${SELECT} WHERE e.id = ?`).bind(id).first<Row>();
  return r ? view(r) : null;
}

/** Confirmed performers, for everyone. With all = true (the organizer), invitations and declines too. */
export async function listPerformers(db: D1Database, eventId: string, all = false): Promise<Performer[]> {
  const { results } = await db.prepare(`SELECT ep.profile_id, ep.status, p.handle, p.display_name, p.photo_key, p.status AS pstatus
    FROM event_performers ep JOIN profiles p ON p.id = ep.profile_id
    WHERE ep.event_id = ? ${all ? '' : "AND ep.status = 'confirmed' AND p.status = 'published'"} ORDER BY ep.invited_at`)
    .bind(eventId).all<{ profile_id: string; status: Performer['status']; handle: string; display_name: string; photo_key: string | null }>();
  return results.map((r) => ({ profileId: r.profile_id, handle: r.handle, name: r.display_name, photo: mediaUrl(r.photo_key), status: r.status }));
}

/** Public, scheduled events that have not ended, soonest first. Our Future and the Events page. */
/** placeId: one city (with its suburbs). metroIds: several cities at once (the cities a member follows). */
export async function listPublicEvents(db: D1Database, opts: { placeId?: string; metroIds?: string[]; limit?: number } = {}, at = now()) {
  const metro = opts.placeId ? PLACE_BY_ID.get(opts.placeId)?.metroId : undefined;
  const metros = metro ? new Set([metro]) : opts.metroIds ? new Set(opts.metroIds) : null;
  if (metros && !metros.size) return [];
  const ids = metros ? [...PLACE_BY_ID.values()].filter((p) => metros.has(p.metroId)).map((p) => p.id) : null;
  const where = ids ? ` AND e.place_id IN (${ids.map(() => '?').join(',')})` : '';
  // An event without an end counts as running for 3 hours (see eventEndsAt).
  const { results } = await db.prepare(`${SELECT} WHERE e.visibility = 'public' AND e.status = 'scheduled' AND p.status = 'published'
    AND COALESCE(e.end_at, e.start_at + 10800000) >= ?${where} ORDER BY e.start_at LIMIT ?`)
    .bind(at, ...(ids ?? []), Math.min(opts.limit ?? 100, 200)).all<Row>();
  return results.map((r) => view(r, at));
}

/** Upcoming public events hosted by one profile (a Clan page). */
export async function listHostedEvents(db: D1Database, profileId: string, at = now()) {
  const { results } = await db.prepare(`${SELECT} WHERE e.organizer_profile_id = ? AND e.visibility = 'public' AND e.status = 'scheduled'
    AND COALESCE(e.end_at, e.start_at + 10800000) >= ? ORDER BY e.start_at LIMIT 20`).bind(profileId, at).all<Row>();
  return results.map((r) => view(r, at));
}

/** Can this viewer open the event page? Unlisted events open for anyone with the link; a hidden organizer profile hides the event. */
export function canView(e: EventView, viewerId: string | null) {
  return e.organizer.published || e.organizer.userId === viewerId;
}

export async function getSave(db: D1Database, userId: string, eventId: string) {
  const r = await db.prepare('SELECT relation FROM event_saves WHERE event_id = ? AND user_id = ?').bind(eventId, userId).first<{ relation: EventRelation }>();
  return r?.relation ?? null;
}

// ---------- organizer actions ----------
async function owned(db: D1Database, user: SessionUser, id: string) {
  const e = await getEvent(db, str(id, 40));
  if (!e) throw new HttpError(404, 'That event doesn’t exist.');
  const clan = e.organizer.userId !== user.id && e.organizer.isClan ? await getClan(db, e.organizer.profileId) : null;
  if (e.organizer.userId !== user.id && !(clan && await isClanAdmin(db, clan, user.id)))
    throw new HttpError(403, 'Only the organizer can change this event.');
  return e;
}

export async function createEvent(env: Env, user: SessionUser, body: Record<string, unknown>) {
  const db = env.DB;
  if (!user.emailVerified) throw new HttpError(403, 'Confirm your email before creating events.');
  const profile = await getMyProfile(db, user.id);
  if (!profile) throw new HttpError(400, 'Set up your profile first. Events show who is organizing them.');
  await limit(db, `event-create:${user.id}`, 20, 86_400_000);
  const v = validateEvent(body);
  // A Clan admin can host as the Clan ("Hosted by Opus Collective"). Checked here, not trusted from the form.
  let hostId = profile.id;
  const host = str(body.hostId, 40);
  if (host && host !== profile.id) {
    const clan = await db.prepare("SELECT p.id, p.owner_user_id FROM profiles p JOIN clan_details d ON d.profile_id = p.id WHERE p.id = ?").bind(host).first<{ id: string; owner_user_id: string }>();
    if (!clan || !(await isClanAdmin(db, { id: clan.id, ownerUserId: clan.owner_user_id }, user.id))) throw new HttpError(403, 'You can only host as a Clan you manage.', 'hostId');
    hostId = clan.id;
  }
  const id = randomId(9);
  const t = now();
  await db.prepare(`INSERT INTO events (id, organizer_user_id, organizer_profile_id, title, description, category, start_at, end_at, timezone, place_id, venue, link, visibility, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`)
    .bind(id, user.id, hostId, v.title, v.description, v.category, v.startAt, v.endAt, v.timezone, v.placeId, v.venue, v.link, v.visibility, t, t).run();
  await audit(db, user.id, 'event.create', { id });
  return { id, href: `/events/${id}` };
}

export async function updateEvent(env: Env, user: SessionUser, id: string, body: Record<string, unknown>) {
  const db = env.DB;
  const e = await owned(db, user, id);
  if (e.status === 'canceled') throw new HttpError(400, 'This event was canceled, so it can’t be edited.');
  if (e.past) throw new HttpError(400, 'This event has ended, so it can’t be edited.');
  await limit(db, `event-edit:${user.id}`, 120, 3_600_000);
  const v = validateEvent(body, now(), e.startAt);
  await db.prepare(`UPDATE events SET title = ?, description = ?, category = ?, start_at = ?, end_at = ?, timezone = ?, place_id = ?, venue = ?, link = ?, visibility = ?, updated_at = ? WHERE id = ?`)
    .bind(v.title, v.description, v.category, v.startAt, v.endAt, v.timezone, v.placeId, v.venue, v.link, v.visibility, now(), e.id).run();
  return { id: e.id, moved: v.startAt !== e.startAt };
}

export async function cancelEvent(env: Env, user: SessionUser, id: string) {
  const e = await owned(env.DB, user, id);
  if (e.status === 'canceled') return;
  await env.DB.prepare("UPDATE events SET status = 'canceled', canceled_at = ?, updated_at = ? WHERE id = ?").bind(now(), now(), e.id).run();
  await audit(env.DB, user.id, 'event.cancel', { id: e.id });
}

export async function uploadEventImage(env: Env, user: SessionUser, id: string, request: Request) {
  const e = await owned(env.DB, user, id);
  await limit(env.DB, `upload:${user.id}`, 30, 3_600_000);
  const { clean, ext, type } = await cleanUpload(request);
  const key = `e/${e.id}/image-${randomId(12)}.${ext}`;
  await env.MEDIA.put(key, clean, { httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' } }).then(() => undefined); // R2Object is not serializable through the local dev proxy
  await env.DB.prepare('UPDATE events SET image_key = ?, updated_at = ? WHERE id = ?').bind(key, now(), e.id).run();
  if (e.imageKey) await env.MEDIA.delete(e.imageKey);
  return mediaUrl(key)!;
}

export async function removeEventImage(env: Env, user: SessionUser, id: string) {
  const e = await owned(env.DB, user, id);
  if (!e.imageKey) return;
  await env.DB.prepare('UPDATE events SET image_key = NULL, updated_at = ? WHERE id = ?').bind(now(), e.id).run();
  await env.MEDIA.delete(e.imageKey);
}

/** The organizer invites a published artist by handle. They appear as performing only once they accept. */
export async function invitePerformer(env: Env, user: SessionUser, id: string, handleIn: unknown) {
  const db = env.DB;
  const e = await owned(db, user, id);
  if (e.status === 'canceled' || e.past) throw new HttpError(400, 'You can only feature artists on upcoming events.');
  await limit(db, `event-invite:${user.id}`, 60, 3_600_000);
  const handle = str(handleIn, 40).replace(/^@/, '').replace(/^.*opuscollect\.net\/(m\/)?/i, '');
  if (!handle) throw new HttpError(400, 'Enter the artist’s Opus username.', 'handle');
  const p = await db.prepare("SELECT id, display_name, status FROM profiles WHERE handle = ? AND kind = 'musician'").bind(handle).first<{ id: string; display_name: string; status: string }>();
  if (!p || p.status !== 'published') throw new HttpError(404, 'We couldn’t find a published Opus profile with that username.', 'handle');
  if (p.id === e.organizer.profileId) throw new HttpError(400, 'You’re the organizer, so you’re already shown as hosting.', 'handle');
  const n = await db.prepare('SELECT COUNT(*) AS n FROM event_performers WHERE event_id = ?').bind(e.id).first<{ n: number }>();
  if ((n?.n ?? 0) >= MAX_PERFORMERS) throw new HttpError(400, `An event can feature up to ${MAX_PERFORMERS} artists.`, 'handle');
  const prev = await db.prepare('SELECT status FROM event_performers WHERE event_id = ? AND profile_id = ?').bind(e.id, p.id).first<{ status: string }>();
  if (prev?.status === 'confirmed') throw new HttpError(400, `${p.display_name} is already confirmed.`, 'handle');
  if (prev?.status === 'invited') throw new HttpError(400, `${p.display_name} already has an invitation.`, 'handle');
  if (prev?.status === 'declined') throw new HttpError(400, `${p.display_name} declined this invitation.`, 'handle');
  await db.prepare("INSERT INTO event_performers (event_id, profile_id, status, invited_at) VALUES (?, ?, 'invited', ?)").bind(e.id, p.id, now()).run();
  return { name: p.display_name };
}

export async function removePerformer(env: Env, user: SessionUser, id: string, profileId: unknown) {
  const e = await owned(env.DB, user, id);
  await env.DB.prepare('DELETE FROM event_performers WHERE event_id = ? AND profile_id = ?').bind(e.id, str(profileId, 40)).run();
}

/** The invited artist accepts or declines. Accepting is what makes them show as performing. Declining later removes them. */
export async function respondToInvite(env: Env, user: SessionUser, id: string, action: unknown) {
  const db = env.DB;
  const profile = await getMyProfile(db, user.id);
  if (!profile) throw new HttpError(404, 'There’s no invitation for you on this event.');
  const row = await db.prepare('SELECT status FROM event_performers WHERE event_id = ? AND profile_id = ?').bind(str(id, 40), profile.id).first<{ status: string }>();
  if (!row) throw new HttpError(404, 'There’s no invitation for you on this event.');
  if (action !== 'accept' && action !== 'decline') throw new HttpError(400, 'Invalid request.');
  if (action === 'accept') {
    const e = await getEvent(db, str(id, 40));
    if (!e || e.status === 'canceled' || e.past) throw new HttpError(400, 'This event isn’t upcoming anymore.');
  }
  await db.prepare('UPDATE event_performers SET status = ?, responded_at = ? WHERE event_id = ? AND profile_id = ?')
    .bind(action === 'accept' ? 'confirmed' : 'declined', now(), str(id, 40), profile.id).run();
}

// ---------- saves ----------
export async function saveEvent(env: Env, user: SessionUser, id: string, relation: unknown = 'saved') {
  const db = env.DB;
  if (!isRelation(relation)) throw new HttpError(400, 'Invalid request.');
  const e = await getEvent(db, str(id, 40));
  if (!e || !canView(e, user.id)) throw new HttpError(404, 'That event doesn’t exist.');
  const existing = await getSave(db, user.id, e.id);
  // Changing how you feel about an event you already saved always works. New saves only for upcoming events.
  if (!existing && (e.status === 'canceled' || e.past)) throw new HttpError(400, e.status === 'canceled' ? 'This event was canceled.' : 'This event has ended.');
  await limit(db, `event-save:${user.id}`, 300, 3_600_000);
  const t = now();
  await db.prepare(`INSERT INTO event_saves (event_id, user_id, relation, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(event_id, user_id) DO UPDATE SET relation = excluded.relation, updated_at = excluded.updated_at`)
    .bind(e.id, user.id, relation, t, t).run();
  return { relation, label: RELATIONS[relation] };
}

export async function unsaveEvent(env: Env, user: SessionUser, id: string) {
  await env.DB.prepare('DELETE FROM event_saves WHERE event_id = ? AND user_id = ?').bind(str(id, 40), user.id).run();
}

// ---------- My Future ----------
export type MyRole = 'hosting' | 'performing' | 'invited' | EventRelation;
export interface MyEvent { event: EventView; role: MyRole }

/**
 * Every event a member is connected to, once each: hosting beats performing beats an invitation beats a save.
 * Includes events that ended in the last 30 days so My Future can show what just happened.
 */
export async function myEvents(db: D1Database, userId: string, at = now()): Promise<MyEvent[]> {
  const since = at - 30 * 86_400_000;
  const ended = 'COALESCE(e.end_at, e.start_at + 10800000) >= ?';
  const [hosting, perf, saved] = await Promise.all([
    db.prepare(`${SELECT} WHERE e.organizer_user_id = ? AND ${ended}`).bind(userId, since).all<Row>(),
    db.prepare(`SELECT e.*, p.display_name AS org_name, p.handle AS org_handle, p.status AS org_status, p.photo_key AS org_photo, p.kind AS org_kind, ep.status AS perf_status
      FROM event_performers ep JOIN profiles me ON me.id = ep.profile_id AND me.owner_user_id = ?
      JOIN events e ON e.id = ep.event_id JOIN profiles p ON p.id = e.organizer_profile_id
      WHERE ep.status IN ('invited', 'confirmed') AND ${ended}`).bind(userId, since).all<Row & { perf_status: string }>(),
    db.prepare(`SELECT e.*, p.display_name AS org_name, p.handle AS org_handle, p.status AS org_status, p.photo_key AS org_photo, p.kind AS org_kind, s.relation
      FROM event_saves s JOIN events e ON e.id = s.event_id JOIN profiles p ON p.id = e.organizer_profile_id
      WHERE s.user_id = ? AND ${ended}`).bind(userId, since).all<Row & { relation: EventRelation }>(),
  ]);
  const out = new Map<string, MyEvent>();
  for (const r of hosting.results) out.set(r.id, { event: view(r, at), role: 'hosting' });
  for (const r of perf.results) if (!out.has(r.id) && (r.org_status === 'published')) out.set(r.id, { event: view(r, at), role: r.perf_status === 'confirmed' ? 'performing' : 'invited' });
  for (const r of saved.results) if (!out.has(r.id) && (r.org_status === 'published')) out.set(r.id, { event: view(r, at), role: r.relation });
  return [...out.values()].sort((a, b) => a.event.startAt - b.event.startAt);
}

export const ROLE_LABEL: Record<MyRole, string> = { hosting: 'Hosting', performing: 'Performing', invited: 'Invited to perform', ...RELATIONS };
