/**
 * Homepage "Explore the World": find the nearest city to the visitor so World can open there.
 * The position stays in the page; it is never sent to Opus or stored.
 */
import type { City } from '@/data/cities';

/** Distance in km between two points (haversine). */
export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** The nearest city in the gazetteer to a position. */
export function nearestCity(cities: City[], p: { lat: number; lng: number }): { city: City; km: number } | undefined {
  let best: { city: City; km: number } | undefined;
  for (const c of cities) { const d = km(p, c); if (!best || d < best.km) best = { city: c, km: d }; }
  return best;
}
