/**
 * Public directory data for Opus World and the homepage globe.
 *
 * Location privacy:
 * - Coordinates come only from the places table (public centre points), never from members.
 * - A member in a locality (e.g. Hoover) is shown at the locality point only when at least
 *   MIN_LOCALITY_GROUP published members share it; otherwise at the metro point (Birmingham).
 * - Every listing also carries its metro point so the globe can aggregate when zoomed out.
 * - Members choose a visibility (city, metro, region, hidden). Only what they chose leaves the server:
 *   a "region" member gets no coordinates and no city; a "hidden" member gets no location at all.
 */
import { MIN_LOCALITY_GROUP } from '@/data/places';
import type { MusicianListing, StudioListing, Listing, StudioType, StudioVerification, GeoPoint, LocationVisibility } from '@/types/directory';
import { money } from '@/lib/booking-time';
import type { Specialty } from '@/data/specialties';
import { mediaUrl } from './profiles';

/** Place columns every directory query selects. */
interface PlaceCols {
  p_kind: 'metro' | 'locality'; p_name: string; p_region: string | null; p_country: string; p_country_name: string; p_lat: number; p_lng: number;
  m_name: string; m_lat: number; m_lng: number; m_region: string | null; locality_count: number | null; location_visibility: LocationVisibility;
}
const PLACE_SELECT = `pl.kind AS p_kind, pl.name AS p_name, pl.region AS p_region, pl.country AS p_country, pl.country_name AS p_country_name, pl.lat AS p_lat, pl.lng AS p_lng,
      m.name AS m_name, m.lat AS m_lat, m.lng AS m_lng, m.region AS m_region, counts.n AS locality_count`;

/**
 * The only place a public location is built. Returns no more than the member chose to show.
 * A locality is shown on its own only when enough members with city-level visibility share it.
 */
export function publicPlace(r: PlaceCols, showOnMap: boolean): { location: GeoPoint; metro?: { name: string; lat: number; lng: number }; onMap: boolean } {
  const vis = r.location_visibility ?? 'city';
  if (vis === 'hidden') return { location: { city: '', country: '', lat: 0, lng: 0, precision: 'hidden' }, onMap: false };
  if (vis === 'region') {
    return { location: { city: '', region: r.m_region ?? undefined, country: r.p_country, countryName: r.p_country_name, lat: 0, lng: 0, precision: 'region' }, onMap: false };
  }
  const showLocality = vis === 'city' && r.p_kind === 'locality' && (r.locality_count ?? 0) >= MIN_LOCALITY_GROUP;
  if (!showLocality) {
    return {
      location: { city: r.p_kind === 'metro' ? r.p_name : `${r.m_name} area`, region: r.m_region ?? undefined, country: r.p_country, countryName: r.p_country_name, lat: r.m_lat, lng: r.m_lng, precision: 'approximate' },
      onMap: showOnMap,
    };
  }
  return {
    location: { city: r.p_name, region: r.p_region ?? undefined, country: r.p_country, countryName: r.p_country_name, lat: r.p_lat, lng: r.p_lng, precision: 'approximate' },
    metro: { name: r.m_name, lat: r.m_lat, lng: r.m_lng },
    onMap: showOnMap,
  };
}

interface Row extends PlaceCols {
  id: string; handle: string; display_name: string; primary_specialty: Specialty; open_to_collab: number; verification: string;
  photo_key: string | null; updated_at: number; show_on_map: number; specialties: string | null; genres: string | null; achievements: string;
}

const firstAchievement = (s: string) => { try { const a = JSON.parse(s) as unknown[]; return typeof a[0] === 'string' ? a[0].slice(0, 120) : undefined; } catch { return undefined; } };

/** Published musicians. Pass onlyId to load one (the counts that protect small suburbs still use everyone). */
export async function publicMusicians(db: D1Database, onlyId?: string): Promise<MusicianListing[]> {
  const { results } = await db.prepare(`
    WITH pub AS (
      SELECT * FROM profiles WHERE status = 'published' AND kind = 'musician' AND place_id IS NOT NULL
    ),
    counts AS (SELECT place_id, COUNT(*) AS n FROM pub WHERE location_visibility = 'city' GROUP BY place_id)
    SELECT pub.id, pub.handle, pub.display_name, pub.primary_specialty, pub.open_to_collab, pub.verification, pub.photo_key, pub.updated_at, pub.show_on_map,
      pub.location_visibility, pub.achievements,
      (SELECT group_concat(specialty) FROM profile_specialties s WHERE s.profile_id = pub.id AND s.is_primary = 0) AS specialties,
      (SELECT group_concat(genre, '|') FROM profile_genres g WHERE g.profile_id = pub.id) AS genres,
      ${PLACE_SELECT}
    FROM pub
    JOIN places pl ON pl.id = pub.place_id
    JOIN places m ON m.id = pl.metro_id
    LEFT JOIN counts ON counts.place_id = pub.place_id
    ${onlyId ? 'WHERE pub.id = ?1' : ''}
    ORDER BY pub.updated_at DESC
    LIMIT 5000`).bind(...(onlyId ? [onlyId] : [])).all<Row>();

  return results.map((r) => {
    const pp = publicPlace(r, r.show_on_map !== 0);
    return {
      id: r.id,
      kind: 'musician',
      slug: r.handle,
      name: r.display_name,
      href: `/m/${r.handle}`,
      photo: mediaUrl(r.photo_key) ?? undefined,
      ...pp,
      primarySpecialty: r.primary_specialty,
      specialties: (r.specialties ? r.specialties.split(',') : []) as Specialty[],
      genres: r.genres ? r.genres.split('|') : [],
      verification: r.verification === 'verified' ? 'verified' : 'none',
      openToCollab: !!r.open_to_collab,
      highlight: firstAchievement(r.achievements),
    } satisfies MusicianListing;
  });
}

interface StudioRow extends PlaceCols {
  id: string; handle: string; display_name: string; photo_key: string | null; cover_key: string | null; show_on_map: number; studio_type: StudioType; equipment: string;
  studio_verification: StudioVerification; services: string | null; min_price: number | null; currency: string | null;
}

/** Published studios with at least one active service. Never selects the private address. */
export async function publicStudios(db: D1Database, onlyId?: string): Promise<StudioListing[]> {
  const { results } = await db.prepare(`
    WITH pub AS (
      SELECT p.id, p.handle, p.display_name, p.photo_key, p.cover_key, p.show_on_map, p.place_id, p.updated_at, p.location_visibility, d.studio_type, d.equipment, d.studio_verification
      FROM profiles p JOIN studio_details d ON d.profile_id = p.id
      WHERE p.status = 'published' AND p.kind = 'studio' AND p.place_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM services s WHERE s.profile_id = p.id AND s.active = 1)
    ),
    counts AS (SELECT place_id, COUNT(*) AS n FROM pub WHERE location_visibility = 'city' GROUP BY place_id)
    SELECT pub.*,
      (SELECT group_concat(name, '|') FROM (SELECT name FROM services s WHERE s.profile_id = pub.id AND s.active = 1 ORDER BY sort LIMIT 4)) AS services,
      (SELECT MIN(price_cents) FROM services s WHERE s.profile_id = pub.id AND s.active = 1) AS min_price,
      (SELECT currency FROM services s WHERE s.profile_id = pub.id AND s.active = 1 ORDER BY price_cents LIMIT 1) AS currency,
      ${PLACE_SELECT}
    FROM pub
    JOIN places pl ON pl.id = pub.place_id
    JOIN places m ON m.id = pl.metro_id
    LEFT JOIN counts ON counts.place_id = pub.place_id
    ${onlyId ? 'WHERE pub.id = ?1' : ''}
    ORDER BY pub.updated_at DESC
    LIMIT 2000`).bind(...(onlyId ? [onlyId] : [])).all<StudioRow>();

  return results.map((r) => {
    let equipment: string[] = [];
    try { equipment = JSON.parse(r.equipment) as string[]; } catch { /* keep empty */ }
    return {
      id: r.id,
      kind: 'studio',
      slug: r.handle,
      name: r.display_name,
      href: `/studios/${r.handle}?from=world`,
      photo: mediaUrl(r.photo_key) ?? undefined,
      cover: mediaUrl(r.cover_key) ?? undefined,
      ...publicPlace(r, r.show_on_map !== 0),
      studioType: r.studio_type,
      services: r.services ? r.services.split('|') : [],
      equipment: equipment.slice(0, 6),
      verification: r.studio_verification,
      plan: 'none',
      acceptsBookingRequests: true,
      priceFrom: r.min_price ? money(r.min_price, r.currency ?? 'USD') : undefined,
    } satisfies StudioListing;
  });
}

export async function directory(env: Env): Promise<{ listings: Listing[]; includesSample: boolean }> {
  const [musicians, studios] = await Promise.all([publicMusicians(env.DB), publicStudios(env.DB)]);
  const real: Listing[] = [...musicians, ...studios];
  // Sample listings are only ever added outside production, and each one is labeled "Sample".
  if (env.SHOW_SAMPLE_DATA === '1' && env.SITE_ENV !== 'production') {
    const { SAMPLE_LISTINGS } = await import('@/data/sample-world');
    return { listings: [...real, ...SAMPLE_LISTINGS], includesSample: true };
  }
  return { listings: real, includesSample: false };
}
