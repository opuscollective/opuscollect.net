/**
 * LocationCluster: hierarchical aggregation for the Opus World map.
 * Country → State/Region → Metro area → City/Suburb.
 *
 * Every point used here is already public (a city or metro centre from the places table),
 * so an aggregate can never be more precise than the listings in it. Members who show only
 * their region, or no location, are never on the map (onMap false) and are skipped.
 * Pure functions, no DOM: shared by the map and the unit tests.
 */
import { hasPoint, type Listing } from '@/types/directory';

export type GeoLevel = 'country' | 'region' | 'metro' | 'place';

/** Zoom thresholds where the map switches level. */
export const LEVEL_ZOOM = { region: 2.6, metro: 4.6, place: 8 } as const;

export const levelForZoom = (z: number): GeoLevel =>
  z < LEVEL_ZOOM.region ? 'country' : z < LEVEL_ZOOM.metro ? 'region' : z < LEVEL_ZOOM.place ? 'metro' : 'place';

/** The zoom to fly to when opening an aggregate: the start of the next level, a little inside it. */
export const nextZoom = (level: GeoLevel) =>
  level === 'country' ? LEVEL_ZOOM.region + 0.6 : level === 'region' ? LEVEL_ZOOM.metro + 0.8 : LEVEL_ZOOM.place + 1.4;

export interface Aggregate {
  key: string;
  level: Exclude<GeoLevel, 'place'>;
  name: string;
  lat: number;
  lng: number;
  count: number;
  ids: string[];
  /** [west, south, east, north] of the member points, to zoom into. */
  bounds: [number, number, number, number];
}

const metroPoint = (l: Listing) => l.metro ?? { name: l.location.city.replace(/ area$/, ''), lat: l.location.lat, lng: l.location.lng };

/** Listings that may appear on the map at all. */
export const mappable = (ls: Listing[]) => ls.filter((l) => l.onMap !== false && hasPoint(l));

export function aggregate(ls: Listing[], level: Exclude<GeoLevel, 'place'>): Aggregate[] {
  const groups = new Map<string, { name: string; pts: { lat: number; lng: number }[]; ids: string[] }>();
  for (const l of mappable(ls)) {
    const m = metroPoint(l);
    const country = l.location.countryName ?? l.location.country;
    let key: string, name: string;
    if (level === 'country') { key = l.location.country; name = country; }
    else if (level === 'region') {
      key = l.location.country + '|' + (l.location.region ?? '');
      name = l.location.region ? l.location.region + ', ' + country : country;
    } else { key = l.location.country + '|' + m.name; name = m.name; }
    const g = groups.get(key) ?? groups.set(key, { name, pts: [], ids: [] }).get(key)!;
    // Aggregates are placed from metro points (Hoover counts toward Birmingham).
    g.pts.push({ lat: m.lat, lng: m.lng });
    g.ids.push(l.id);
  }
  const out: Aggregate[] = [];
  for (const [key, g] of groups) {
    const lats = g.pts.map((p) => p.lat), lngs = g.pts.map((p) => p.lng);
    // Weighted centre for regions and countries; the metro point itself for metros.
    const lat = lats.reduce((a, b) => a + b, 0) / lats.length;
    const lng = lngs.reduce((a, b) => a + b, 0) / lngs.length;
    out.push({ key: level + ':' + key, level, name: g.name, lat, lng, count: g.ids.length, ids: g.ids, bounds: [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)] });
  }
  return out;
}

/**
 * Individual points (the closest level). Members who share a public point are spread on a
 * small ring around it so each stays selectable. The ring comes only from the public point
 * and the member's order, so it reveals nothing new.
 */
export function placePoints(ls: Listing[]): { id: string; kind: Listing['kind']; lat: number; lng: number; approx: boolean }[] {
  const groups = new Map<string, Listing[]>();
  for (const l of mappable(ls)) {
    const k = l.location.lat.toFixed(4) + ',' + l.location.lng.toFixed(4);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(l);
  }
  const out: ReturnType<typeof placePoints> = [];
  for (const g of groups.values()) {
    g.forEach((l, i) => {
      let { lat, lng } = l.location;
      if (g.length > 1) {
        const r = 0.006 * (1 + Math.floor(i / 8)); // degrees, about 600 m per ring
        const a = ((i % 8) / Math.min(8, g.length)) * Math.PI * 2;
        lat += r * Math.sin(a);
        lng += (r * Math.cos(a)) / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
      }
      out.push({ id: l.id, kind: l.kind, lat, lng, approx: l.location.precision === 'approximate' });
    });
  }
  return out;
}
