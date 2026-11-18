/**
 * Universal search for World: one box for people, studios, cities, specialties and genres.
 * Pure functions (no DOM), shared by the page script and tests.
 */
import { SPECIALTIES, allSpecialties, type Specialty } from '@/data/specialties';
import { GENRES } from '@/data/genres';
import { CITIES } from '@/data/cities';
import { placeText } from './world';
import { hasPoint, type Listing } from '@/types/directory';

export type Suggestion =
  | { type: 'place'; label: string; detail: string; lat: number; lng: number; count: number }
  | { type: 'specialty'; label: string; value: Specialty; count: number }
  | { type: 'genre'; label: string; value: string; count: number }
  | { type: 'listing'; label: string; detail: string; id: string };

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export interface Place { name: string; detail: string; lat: number; lng: number; count: number }

/**
 * Places people can search: our city gazetteer plus every metro area that has listings.
 * Listings count toward their metro (Hoover counts toward Birmingham), matching the globe.
 */
export function placeIndex(listings: Listing[]): Place[] {
  const map = new Map<string, Place>();
  const key = (name: string, country: string) => `${norm(name)}|${country}`;
  for (const c of CITIES) map.set(key(c.name, c.country), { name: c.name, detail: [c.region, c.countryName].filter(Boolean).join(', '), lat: c.lat, lng: c.lng, count: 0 });
  for (const l of listings) {
    if (!hasPoint(l)) continue; // members who show only a region, or nothing, add no place
    const metro = l.metro ?? { name: l.location.city.replace(/ area$/, ''), lat: l.location.lat, lng: l.location.lng };
    const k = key(metro.name, l.location.country);
    const p = map.get(k) ?? map.set(k, { name: metro.name, detail: [l.location.region, l.location.countryName ?? l.location.country].filter(Boolean).join(', '), lat: metro.lat, lng: metro.lng, count: 0 }).get(k)!;
    p.count++;
  }
  return [...map.values()];
}

const starts = (hay: string, q: string) => hay.startsWith(q) || hay.includes(` ${q}`);

export function suggest(query: string, listings: Listing[], places: Place[]): Suggestion[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const out: Suggestion[] = [];

  const pl = places
    .filter((p) => starts(norm(p.name), q) || starts(norm(p.detail), q))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 4);
  out.push(...pl.map((p) => ({ type: 'place' as const, label: p.name, detail: p.detail, lat: p.lat, lng: p.lng, count: p.count })));

  const musicians = listings.filter((l) => l.kind === 'musician');
  for (const [k, s] of Object.entries(SPECIALTIES) as [Specialty, (typeof SPECIALTIES)[Specialty]][]) {
    if (!starts(norm(s.label), q) && !starts(norm(s.plural), q)) continue;
    const count = musicians.filter((l) => l.kind === 'musician' && allSpecialties(l.primarySpecialty, l.specialties).includes(k)).length;
    out.push({ type: 'specialty', label: s.plural, value: k, count });
  }
  for (const g of GENRES) {
    if (!starts(norm(g), q)) continue;
    out.push({ type: 'genre', label: g, value: g, count: musicians.filter((l) => l.kind === 'musician' && l.genres.includes(g)).length });
  }

  const people = listings.filter((l) => starts(norm(l.name), q)).slice(0, 4);
  out.push(...people.map((l) => ({ type: 'listing' as const, label: l.name, detail: placeText(l), id: l.id })));
  return out.slice(0, 10);
}
