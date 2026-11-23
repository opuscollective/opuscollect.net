/** Gathers a member's Future: sessions, planned releases and the events they host, perform at or saved. */
import { listMyBookings, listBusinessBookings, STATUS_LABEL } from './bookings';
import { listMyStudios } from './business';
import { listMyReleases } from './releases';
import { EVENTS } from '@/data/events';
import { myEvents, listPublicEvents, ROLE_LABEL, type EventView, type MyRole } from './events';
import { formatSlot, tzAbbr, localDay } from '@/lib/booking-time';
import { formatDay, type FutureItem } from '@/lib/future';

const LIVE = new Set(['requested', 'accepted']);
const KIND_NAME: Record<string, string> = { single: 'Single', ep: 'EP', album: 'Album', mixtape: 'Mixtape' };

/** Collective events from src/data/events.ts. Announced facts only: undated ones stay undated. */
export function collectiveItems(): FutureItem[] {
  return EVENTS.map((e) => ({ id: `opus-${e.id}`, kind: 'event', title: e.title, detail: `Opus Collective · ${e.place}`, when: e.when, day: e.when.startsWith('Dates') ? null : e.sortDay, at: 0, href: e.href }));
}

export function eventItem(e: EventView, role?: MyRole): FutureItem {
  const canceled = e.status === 'canceled';
  return {
    id: `ev-${e.id}`, kind: 'event', title: e.title, detail: [e.categoryLabel, e.venue, e.place.split(',')[0]].filter(Boolean).join(' · '),
    when: e.when, day: e.day, at: e.startAt, image: e.image, eventId: e.id, past: e.past, href: e.href,
    status: canceled ? 'Canceled' : role ? ROLE_LABEL[role] : undefined,
    tone: canceled ? 'canceled' : role === 'invited' ? 'pending' : role ? 'role' : undefined,
  };
}

/** Our Future: public member events plus Collective events. */
/** Our Future: everywhere, one city, or the cities a member follows (metroIds). Nothing is added to My Future by this. */
export async function ourFuture(db: D1Database, placeId?: string, metroIds?: string[]) {
  const events = await listPublicEvents(db, { placeId, metroIds: placeId ? undefined : metroIds });
  return [...events.map((e) => eventItem(e)), ...(placeId || metroIds ? [] : collectiveItems())];
}

/** My Future. Each source appears once; nothing is invented. Past member events (last 30 days) come back with past = true. */
export async function futureFor(db: D1Database, userId: string, now = Date.now()): Promise<FutureItem[]> {
  const items: FutureItem[] = (await myEvents(db, userId, now)).map((m) => eventItem(m.event, m.role));
  const when = (ts: number, tz: string) => `${formatSlot(ts, tz)} ${tzAbbr(ts, tz)}`;

  // Sessions you booked.
  for (const b of await listMyBookings(db, userId)) {
    if (!LIVE.has(b.status)) continue;
    if (b.start_at && b.start_at < now) continue;
    items.push({
      id: `booking-${b.id}`, kind: 'session', title: b.service_name, detail: b.studio_name,
      when: b.start_at ? when(b.start_at, b.timezone) : 'Remote project · no set date',
      day: b.start_at ? localDay(b.start_at, b.timezone) : null, at: b.start_at ?? 0,
      status: STATUS_LABEL[b.status], href: `/bookings/${b.id}`,
    });
  }
  // Sessions booked with your studio.
  for (const studio of await listMyStudios(db, userId)) {
    for (const b of await listBusinessBookings(db, studio.id)) {
      if (!LIVE.has(b.status)) continue;
      if (b.start_at && b.start_at < now) continue;
      items.push({
        id: `studio-${b.id}`, kind: 'session', title: b.service_name, detail: `${b.customer_name} at ${studio.name}`,
        when: b.start_at ? when(b.start_at, b.timezone) : 'Remote project · no set date',
        day: b.start_at ? localDay(b.start_at, b.timezone) : null, at: b.start_at ?? 0,
        status: STATUS_LABEL[b.status], href: '/business/bookings',
      });
    }
  }
  // Releases with a planned date that has not passed.
  const today = new Date(now).toISOString().slice(0, 10);
  for (const r of await listMyReleases(db, userId)) {
    if (r.released || !r.releaseDate || r.releaseDate < today) continue;
    items.push({
      id: `release-${r.id}`, kind: 'release', title: r.title, detail: `${KIND_NAME[r.kind] ?? 'Release'}${r.status === 'draft' ? ' · draft' : ''}`,
      when: formatDay(r.releaseDate), day: r.releaseDate, at: 0, href: `/works/${r.id}`,
    });
  }
  // Sessions a group shared that I said I'm going to. Shared by someone else, so they aren't already in my Future.
  try {
    const { results } = await db.prepare(`SELECT g.id, g.session, p.display_name AS group_name, p.handle FROM group_rsvps r
        JOIN group_messages g ON g.id = r.message_id JOIN profiles p ON p.id = g.clan_id
      WHERE r.user_id = ? AND r.status = 'going' AND g.sender_id <> ? AND g.session_at > ? ORDER BY g.session_at LIMIT 50`).bind(userId, userId, now)
      .all<{ id: number; session: string; group_name: string; handle: string }>();
    for (const r of results) {
      const c = JSON.parse(r.session) as { title: string; detail: string; when: string; at: number; day?: string | null; href?: string | null };
      items.push({ id: `grp-${r.id}`, kind: 'session', title: c.title, detail: [c.detail, r.group_name].filter(Boolean).join(' · '), when: c.when, day: c.day ?? new Date(c.at).toISOString().slice(0, 10), at: c.at, status: 'Going', tone: 'role', href: c.href || `/c/${r.handle}` });
    }
  } catch { /* migration 0014 not applied yet */ }
  return items;
}
