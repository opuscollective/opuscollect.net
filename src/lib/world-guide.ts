/**
 * City guide: an editorial view of one place in World, built only from the listings Opus has.
 * A header with real counts, then shelves (the place's most common specialties, studios, people open
 * to collaborate, organizations). Nothing is ranked by payment; verified members lead each shelf.
 * Pure: no DOM. Relative imports with extensions so `node --test` can load it.
 */
import { SPECIALTIES, type Specialty } from '../data/specialties.ts';
import type { Listing, ListingKind } from '../types/directory';

export interface GuidePlace { name: string; lat: number; lng: number }
export interface ShelfFilter { kind?: ListingKind; specialty?: Specialty; collab?: boolean }
export interface Shelf { key: string; title: string; items: Listing[]; total: number; filter: ShelfFilter }
export interface CityGuide { name: string; total: number; musicians: number; studios: number; organizations: number; shelves: Shelf[] }

/** Members counted as "in" a place: within this distance of it, by their metro point. */
export const GUIDE_KM = 100;
const SHELF_MAX = 12;

const R = Math.PI / 180;
export function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const x = Math.sin(a.lat * R) * Math.sin(b.lat * R) + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.cos((a.lng - b.lng) * R);
  return Math.acos(Math.min(1, Math.max(-1, x))) * 6371;
}
const onMapPoint = (l: Listing) => l.location.precision === 'approximate' || l.location.precision === 'exact';
const metroPoint = (l: Listing) => l.metro ?? { lat: l.location.lat, lng: l.location.lng };
const verified = (l: Listing) =>
  l.kind === 'musician' ? l.verification === 'verified' : l.kind === 'studio' ? l.verification !== 'none' : l.verified;
/** Verified first, then a stable order. Never paid placement. */
const lead = (ls: Listing[]) => [...ls].sort((a, b) => Number(verified(b)) - Number(verified(a)) || a.id.localeCompare(b.id));

export function inPlace(all: Listing[], place: GuidePlace, km = GUIDE_KM): Listing[] {
  return all.filter((l) => onMapPoint(l) && kmBetween(place, metroPoint(l)) <= km);
}

export function cityGuide(all: Listing[], place: GuidePlace, km = GUIDE_KM): CityGuide {
  const here = inPlace(all, place, km);
  const musicians = here.filter((l) => l.kind === 'musician');
  const studios = here.filter((l) => l.kind === 'studio');
  const orgs = here.filter((l) => l.kind === 'organization');
  const shelf = (key: string, title: string, items: Listing[], filter: ShelfFilter): Shelf =>
    ({ key, title, items: lead(items).slice(0, SHELF_MAX), total: items.length, filter });

  // The place's own character: its most common primary specialties (two or more people each).
  const bySpec = new Map<Specialty, Listing[]>();
  for (const m of musicians) if (m.kind === 'musician') bySpec.set(m.primarySpecialty, [...(bySpec.get(m.primarySpecialty) ?? []), m]);
  const top = [...bySpec.entries()].filter(([, ls]) => ls.length >= 2).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).slice(0, 3);

  const shelves: Shelf[] = [];
  const [first, ...rest] = top;
  if (first) shelves.push(shelf(`spec-${first[0]}`, SPECIALTIES[first[0]].plural, first[1], { kind: 'musician', specialty: first[0] }));
  if (studios.length) shelves.push(shelf('studios', 'Studios', studios, { kind: 'studio' }));
  for (const [s, ls] of rest) shelves.push(shelf(`spec-${s}`, SPECIALTIES[s].plural, ls, { kind: 'musician', specialty: s }));
  const collab = musicians.filter((l) => l.kind === 'musician' && l.openToCollab);
  if (collab.length >= 2) shelves.push(shelf('collab', 'Open to collaborate', collab, { kind: 'musician', collab: true }));
  if (orgs.length) shelves.push(shelf('orgs', 'Labels and organizations', orgs, { kind: 'organization' }));

  return { name: place.name, total: here.length, musicians: musicians.length, studios: studios.length, organizations: orgs.length, shelves };
}
