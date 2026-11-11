/**
 * Homepage directory panel: after the camera moves into the globe, a centered panel lists real
 * Opus World results for the visitor's words (sample listings only on preview builds, labeled).
 * The full experience stays on /world; every result and the footer link go there.
 */
import { hasPoint, type Listing, type ListingKind } from '@/types/directory';
import { matches, metaText, placeText, mainImage, badgeHtml, initials, esc, type WorldFilters } from '@/lib/world';
import { imageHtml, installImageFallbacks } from '@/lib/media';
import { citySlug, type City } from '@/data/cities';

let cache: Promise<Listing[]> | null = null;
export const loadListings = () =>
  (cache ??= fetch('/api/world')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((d: { listings: Listing[] }) => d.listings)
    .catch((e) => { cache = null; throw e; }));

const inCity = (l: Listing, c: City) => (l.metro?.name ?? l.location.city) === c.name || l.location.city === c.name;

/** The same filters as the Opus World directory, minus the map-only ones. */
export type DiveFilters = Pick<WorldFilters, 'specialty' | 'genre' | 'studioType' | 'openToCollab' | 'verifiedOnly'>;

/**
 * city: a place named in the words (for the camera). plain: the words are only that place.
 * near: the visitor's own position, shared by the browser for this page only (never sent or stored),
 * used to sort results by distance.
 */
export interface DiveQuery { text: string; kind: ListingKind | ''; city?: City; plain?: boolean; near?: { lat: number; lng: number }; filters?: DiveFilters }

/** Distance in km between two points (haversine). */
export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** The public point a listing is shown at: its metro or city centre, never an address. */
const pointOf = (l: Listing) => (hasPoint(l) ? (l.metro ?? { lat: l.location.lat, lng: l.location.lng }) : null);

/** The nearest city in the gazetteer to a position, so the panel can say "Near Birmingham". */
export function nearestCity(cities: City[], p: { lat: number; lng: number }): { city: City; km: number } | undefined {
  let best: { city: City; km: number } | undefined;
  for (const c of cities) { const d = km(p, c); if (!best || d < best.km) best = { city: c, km: d }; }
  return best;
}

/** About a two-hour drive: what "near you" means on the homepage. */
export const NEAR_KM = 160;

export function filter(all: Listing[], q: DiveQuery): Listing[] {
  const f: WorldFilters = { kinds: q.kind ? [q.kind] : [], verifiedOnly: false, ...q.filters, text: q.plain ? '' : q.text };
  const out = all.filter((l) => matches(l, f) && (!q.plain || !q.city || q.near || inCity(l, q.city)));
  const from = q.near;
  if (!from) return out;
  // Nearest first. Listings that don't show a place go last.
  const d = (l: Listing) => { const p = pointOf(l); return p ? km(from, p) : Infinity; };
  return out.map((l) => [l, d(l)] as const).sort((a, b) => a[1] - b[1]).map(([l]) => l);
}

/** How many of the (sorted) results are within NEAR_KM of the visitor. */
export function nearCount(results: Listing[], near: { lat: number; lng: number }): number {
  return results.filter((l) => { const p = pointOf(l); return !!p && km(near, p) <= NEAR_KM; }).length;
}

export function worldHref(q: DiveQuery, id?: string): string {
  const u = new URLSearchParams();
  const path = { '': '/world', musician: '/musicians', studio: '/studios', organization: '/organizations' }[q.kind];
  let base: string = path;
  if (q.plain && q.city) { if (q.kind) u.set('city', q.city.name); else base = `/world/${citySlug(q.city.name)}`; }
  else if (q.text.trim()) u.set('q', q.text.trim());
  if (id) u.set('p', id);
  const s = u.toString();
  return base + (s ? `?${s}` : '');
}

export function rowHtml(l: Listing, href: string, near?: { lat: number; lng: number }): string {
  const img = imageHtml({ src: mainImage(l), seed: l.id, kind: l.kind, ratio: 'square', label: l.isSample ? undefined : initials(l.name) });
  const sample = l.isSample ? '<span class="dv__sample">Sample</span>' : '';
  return `<li><a class="dv__row" href="${esc(href)}">${img}<span class="dv__txt"><span class="dv__name">${esc(l.name)}${badgeHtml(l)}${sample}</span><span class="dv__meta">${esc(metaText(l))}</span><span class="dv__where">${esc(placeText(l))}${distText(l, near)}</span></span></a></li>`;
}

/** Rounded distance to the listing's public city point: miles for US and UK browsers, km elsewhere. */
function distText(l: Listing, near?: { lat: number; lng: number }): string {
  const p = near && pointOf(l);
  if (!near || !p) return '';
  const k = km(near, p);
  const miles = /^en-(US|GB)/.test(navigator.language);
  const n = miles ? k / 1.609 : k;
  const v = n < 1 ? '< 1' : n < 10 ? n.toFixed(0) : String(Math.round(n / 5) * 5 || 5);
  return ` · ${v} ${miles ? 'mi' : 'km'}`;
}

let fallbacks = false;
export function ensureImageFallbacks(root: HTMLElement) {
  if (fallbacks) return;
  fallbacks = true;
  installImageFallbacks(root);
}
