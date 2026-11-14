/** Gathers a member's Future from existing records. Read-only; no tables of its own. */
import { listMyBookings, listBusinessBookings, STATUS_LABEL } from './bookings';
import { getMyStudio } from './business';
import { listMyReleases } from './releases';
import { EVENTS } from '@/data/events';
import { formatSlot, tzAbbr, localDay } from '@/lib/booking-time';
import { formatDay, type FutureItem } from '@/lib/future';

const LIVE = new Set(['requested', 'accepted']);
const KIND_NAME: Record<string, string> = { single: 'Single', ep: 'EP', album: 'Album', mixtape: 'Mixtape' };

export function eventItems(): FutureItem[] {
  return EVENTS.map((e) => ({ id: `event-${e.id}`, kind: 'event', title: e.title, detail: e.place, when: e.when, day: e.sortDay, at: 0, href: e.href }));
}

export async function futureFor(db: D1Database, userId: string, now = Date.now()): Promise<FutureItem[]> {
  const items: FutureItem[] = [];
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
  const studio = await getMyStudio(db, userId);
  if (studio) {
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
      when: formatDay(r.releaseDate), day: r.releaseDate, at: 0, href: `/music/${r.id}`,
    });
  }
  return [...items, ...eventItems()];
}
