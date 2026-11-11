/**
 * Homepage directory panel: after the camera moves into the globe, a centered panel lists real
 * Opus World results for the visitor's words (sample listings only on preview builds, labeled).
 * The full experience stays on /world; every result and the footer link go there.
 */
import type { Listing, ListingKind } from '@/types/directory';
import { matches, metaText, placeText, mainImage, badgeHtml, initials, esc, type WorldFilters } from '@/lib/world';
import { imageHtml, installImageFallbacks } from '@/lib/media';
import type { City } from '@/data/cities';

let cache: Promise<Listing[]> | null = null;
export const loadListings = () =>
  (cache ??= fetch('/api/world')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((d: { listings: Listing[] }) => d.listings)
    .catch((e) => { cache = null; throw e; }));

const inCity = (l: Listing, c: City) => (l.metro?.name ?? l.location.city) === c.name || l.location.city === c.name;

/** city: a place named in the words (for the camera). plain: the words are only that place. */
export interface DiveQuery { text: string; kind: ListingKind | ''; city?: City; plain?: boolean }

export function filter(all: Listing[], q: DiveQuery): Listing[] {
  const f: WorldFilters = { kinds: q.kind ? [q.kind] : [], verifiedOnly: false, text: q.plain ? '' : q.text };
  return all.filter((l) => matches(l, f) && (!q.plain || !q.city || inCity(l, q.city)));
}

export function worldHref(q: DiveQuery, id?: string): string {
  const u = new URLSearchParams();
  if (q.plain && q.city) u.set('city', q.city.name);
  else if (q.text.trim()) u.set('q', q.text.trim());
  if (q.kind) u.set('type', q.kind);
  if (id) u.set('p', id);
  const s = u.toString();
  return '/world' + (s ? `?${s}` : '');
}

export function rowHtml(l: Listing, href: string): string {
  const img = imageHtml({ src: mainImage(l), seed: l.id, kind: l.kind, ratio: 'square', label: l.isSample ? undefined : initials(l.name) });
  const sample = l.isSample ? '<span class="dv__sample">Sample</span>' : '';
  return `<li><a class="dv__row" href="${esc(href)}">${img}<span class="dv__txt"><span class="dv__name">${esc(l.name)}${badgeHtml(l)}${sample}</span><span class="dv__meta">${esc(metaText(l))}</span><span class="dv__where">${esc(placeText(l))}</span></span></a></li>`;
}

let fallbacks = false;
export function ensureImageFallbacks(root: HTMLElement) {
  if (fallbacks) return;
  fallbacks = true;
  installImageFallbacks(root);
}
