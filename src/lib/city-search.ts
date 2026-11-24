/**
 * One way to choose a place on Opus: the city. Type a city, a suburb of one, or a US ZIP code.
 * A suburb or ZIP resolves to the nearest Opus city (its metro), so the answer is always a city id.
 * Everything runs on the bundled gazetteer (src/data/places.ts); no geocoding service is called.
 * Relative imports with .ts so the node test runner can load this file.
 */
import { PLACES, placeLabel, type Place } from '../data/places.ts';
import { CITIES } from '../data/cities.ts';

export interface CityOption { id: string; label: string; sub: string; lat: number; lng: number }

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const BY_ID = new Map(PLACES.map((p) => [p.id, p]));
const METROS = PLACES.filter((p) => p.kind === 'metro').sort((a, b) => a.countryName.localeCompare(b.countryName) || a.name.localeCompare(b.name));
const ALIASES = new Map(CITIES.map((c) => [fold(c.name), (c.aliases ?? []).map(fold)]));

const optionOf = (metro: Place, via?: Place): CityOption => ({
  id: metro.id, label: [metro.name, metro.region].filter(Boolean).join(', '),
  sub: via ? `${via.name} is in the ${metro.name} area` : metro.countryName, lat: metro.lat, lng: metro.lng,
});

/** Every Opus city, for showing the whole directory when the field is empty. */
export const allCities = (): CityOption[] => METROS.map((m) => optionOf(m));

/** The city that holds this place id (a suburb's id gives its metro). */
export function cityFor(placeId: string | null | undefined): CityOption | null {
  const p = placeId ? BY_ID.get(placeId) : undefined;
  if (!p) return null;
  const metro = BY_ID.get(p.metroId) ?? p;
  return optionOf(metro, p.kind === 'locality' ? p : undefined);
}

/** Cities (and suburbs, shown as their city) matching what was typed, best first. */
export function searchCities(query: string, limit = 8): CityOption[] {
  const q = fold(query);
  if (!q) return [];
  const scored = new Map<string, { o: CityOption; s: number }>();
  const add = (o: CityOption, s: number) => { const cur = scored.get(o.id); if (!cur || s > cur.s) scored.set(o.id, { o, s }); };
  for (const p of PLACES) {
    const metro = BY_ID.get(p.metroId) ?? p;
    const n = fold(p.name);
    const withRegion = fold([p.name, p.region].filter(Boolean).join(' '));
    let s = 0;
    if (n === q || withRegion === q) s = 100;
    else if (n.startsWith(q) || withRegion.startsWith(q)) s = 80;
    else if (n.split(' ').some((w) => w.startsWith(q))) s = 60;
    else if ((ALIASES.get(fold(p.name)) ?? []).some((a) => a === q || a.startsWith(q))) s = 70;
    else if (fold(`${p.name} ${p.region ?? ''} ${p.countryName}`).includes(q)) s = 30;
    if (!s) continue;
    // A suburb ranks just under a city of the same name.
    add(optionOf(metro, p.kind === 'locality' ? p : undefined), p.kind === 'locality' ? s - 5 : s);
  }
  return [...scored.values()].sort((a, b) => b.s - a.s || a.o.label.localeCompare(b.o.label)).slice(0, limit).map((x) => x.o);
}

const rad = (d: number) => (d * Math.PI) / 180;
const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

/** The nearest Opus city to a point, if there is one within maxKm. */
export function nearestCity(point: { lat: number; lng: number }, maxKm = 250): (CityOption & { km: number }) | null {
  let best: { m: Place; d: number } | null = null;
  for (const m of METROS) { const d = km(point, m); if (!best || d < best.d) best = { m, d }; }
  return best && best.d <= maxKm ? { ...optionOf(best.m), km: Math.round(best.d) } : null;
}

export { placeLabel };
