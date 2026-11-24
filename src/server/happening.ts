/**
 * Happening: what is going on in one city, gathered from data that already exists
 * (listening parties, events, studios, members). Real rows only; a quiet city shows as quiet.
 */
import { PLACE_BY_ID, type Place } from '@/data/places';
import { citySlug } from '@/data/cities';
import { SPECIALTIES } from '@/data/specialties';
import { directory } from './directory';
import { listPublicEvents, myEvents, ROLE_LABEL } from './events';
import { listPublicParties } from './parties';
import { mediaUrl } from './profiles';
import type { StudioListing } from '@/types/directory';

export interface HappeningItem { kind: 'party' | 'event'; href: string; title: string; by: string; when: string; at: number; image: string | null; live: boolean; tag: string; listening?: number }
export interface HappeningPerson { href: string; name: string; photo: string | null; specialty: string; isNew: boolean }
export interface HappeningStudio { href: string; name: string; photo: string | null; line: string; isSample: boolean }
export interface Happening {
  city: Place; slug: string;
  items: HappeningItem[]; mine: { href: string; title: string; when: string; role: string }[];
  studios: HappeningStudio[]; people: HappeningPerson[]; anyNew: boolean;
}

const NEW_MS = 30 * 86_400_000;
const soft = async <T>(p: Promise<T>, fallback: T): Promise<T> => { try { return await p; } catch { return fallback; } };

export async function happeningIn(env: Env, metroId: string, userId: string | null, t = Date.now()): Promise<Happening | null> {
  const city = PLACE_BY_ID.get(metroId);
  if (!city || city.kind !== 'metro') return null;
  const [parties, events, dir, people, mine] = await Promise.all([
    soft(listPublicParties(env, t), []),
    soft(listPublicEvents(env.DB, { placeId: city.id, limit: 12 }, t), []),
    soft(directory(env), { listings: [], includesSample: false }),
    soft(env.DB.prepare(
      `SELECT p.handle, p.display_name, p.photo_key, p.primary_specialty, p.created_at FROM profiles p JOIN places pl ON pl.id = p.place_id
       WHERE p.kind = 'musician' AND p.status = 'published' AND coalesce(pl.metro_id, pl.id) = ? AND coalesce(p.location_visibility, 'city') IN ('city', 'metro')
       ORDER BY p.created_at DESC LIMIT 8`).bind(city.id).all<{ handle: string; display_name: string; photo_key: string | null; primary_specialty: string | null; created_at: number }>().then((r) => r.results), []),
    userId ? soft(myEvents(env.DB, userId, t), []) : Promise.resolve([]),
  ]);
  const items: HappeningItem[] = [
    ...parties.filter((p) => p.city === city.name).map((p): HappeningItem => ({ kind: 'party', href: p.href, title: p.title, by: p.host, when: p.label, at: p.startsAt, image: p.cover, live: p.live, tag: 'Listening party', listening: p.listening })),
    ...events.map((e): HappeningItem => ({ kind: 'event', href: e.href, title: e.title, by: [e.venue, e.organizer.name].filter(Boolean).join(' · '), when: e.when, at: e.startAt, image: e.image, live: e.startAt <= t, tag: e.categoryLabel })),
  ].sort((a, b) => Number(b.live) - Number(a.live) || a.at - b.at).slice(0, 12);
  const inCity = (l: { location: { city: string }; metro?: { name: string } }) => l.metro?.name === city.name || l.location.city === city.name || l.location.city === `${city.name} area`;
  const studios = dir.listings.filter((l): l is StudioListing => l.kind === 'studio' && inCity(l)).slice(0, 4)
    .map((s) => ({ href: s.href ?? `/studios/${s.slug}`, name: s.name, photo: s.cover ?? s.photo ?? null, line: [s.priceFrom ? `From ${s.priceFrom}` : null, s.services.slice(0, 2).join(', ') || null].filter(Boolean).join(' · '), isSample: !!s.isSample }));
  const ppl = people.map((r) => ({ href: `/${r.handle}`, name: r.display_name, photo: mediaUrl(r.photo_key), specialty: SPECIALTIES[r.primary_specialty as keyof typeof SPECIALTIES]?.label ?? 'Opus member', isNew: t - r.created_at < NEW_MS }));
  return {
    city, slug: citySlug(city.name), items,
    mine: mine.filter((m) => m.role === 'invited' || m.role === 'hosting' || m.role === 'performing').slice(0, 4).map((m) => ({ href: m.event.href, title: m.event.title, when: m.event.when, role: ROLE_LABEL[m.role] })),
    studios, people: ppl, anyNew: ppl.some((p) => p.isNew),
  };
}
