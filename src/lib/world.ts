/** Pure helpers shared by the server render and the browser. No DOM access here. */
import { ORG_CATEGORY_LABEL, hasPoint, type Listing, type ListingKind } from '@/types/directory';
import { SPECIALTIES, allSpecialties, type Specialty } from '@/data/specialties';
import { esc } from './html';
import { imageHtml } from './media';

export interface WorldFilters {
  kinds: ListingKind[]; // empty = all
  specialty?: Specialty | '';
  genre?: string;
  openToCollab?: boolean;
  studioType?: 'commercial' | 'home' | 'remote' | '';
  verifiedOnly: boolean;
  text: string;
}

export const isVerified = (l: Listing) =>
  l.kind === 'musician' ? l.verification === 'verified' : l.kind === 'studio' ? l.verification !== 'none' : l.verified;

export function matches(l: Listing, f: WorldFilters): boolean {
  if (f.kinds.length && !f.kinds.includes(l.kind)) return false;
  if (f.verifiedOnly && !isVerified(l)) return false;
  if (f.specialty && (l.kind !== 'musician' || !allSpecialties(l.primarySpecialty, l.specialties).includes(f.specialty))) return false;
  if (f.genre && (l.kind !== 'musician' || !l.genres.includes(f.genre))) return false;
  if (f.openToCollab && (l.kind !== 'musician' || !l.openToCollab)) return false;
  if (f.studioType && (l.kind !== 'studio' || l.studioType !== f.studioType)) return false;
  const q = f.text.trim().toLowerCase();
  if (q) {
    const hay = [l.name, l.slug, l.location.city, l.metro?.name ?? '', l.location.region ?? '', l.location.country, kindLabel(l), ...(l.kind === 'musician' ? [...l.genres, ...allSpecialties(l.primarySpecialty, l.specialties).map((s) => SPECIALTIES[s].label)] : l.services)]
      .join(' ')
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export type WorldStats = ReturnType<typeof stats>;
export function stats(listings: Listing[]) {
  return {
    musicians: listings.filter((l) => l.kind === 'musician').length,
    studios: listings.filter((l) => l.kind === 'studio').length,
    countries: new Set(listings.map((l) => l.location.country).filter(Boolean)).size,
    verified: listings.filter((l) => l.kind === 'musician' && l.verification === 'verified').length,
    organizations: listings.filter((l) => l.kind === 'organization').length,
  };
}

/** City-level aggregation for the homepage globe. */
export function byCity(listings: Listing[]) {
  const m = new Map<string, { city: string; country: string; lat: number; lng: number; count: number }>();
  for (const l of listings) {
    if (l.onMap === false || !hasPoint(l)) continue;
    // Aggregate to the metro area (suburbs count toward their city).
    const pt = l.metro ?? { name: l.location.city, lat: l.location.lat, lng: l.location.lng };
    const k = `${pt.name}|${l.location.country}`;
    const e = m.get(k);
    if (e) e.count++;
    else m.set(k, { city: pt.name, country: l.location.country, lat: pt.lat, lng: pt.lng, count: 1 });
  }
  return [...m.values()];
}

export { esc };
// Placeholder avatars show the sample number (e.g. "07"); real members will have photos.
export const initials = (s: string) => {
  const num = s.match(/(\d+)\s*$/)?.[1];
  if (/^Sample\s/.test(s) && num) return num;
  return s.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
};

const SEAL =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="s" d="M12 1.8l2.3 1.7 2.85-.2.9 2.7 2.35 1.6-.9 2.73.9 2.73-2.35 1.6-.9 2.7-2.85-.2L12 22.2l-2.3-1.7-2.85.2-.9-2.7-2.35-1.6.9-2.73-.9-2.73 2.35-1.6.9-2.7 2.85.2z"/><path class="c" d="M8 12.2l2.6 2.6L16.2 9"/></svg>';

export function badgeHtml(l: Listing): string {
  // Sample listings show the badge only to preview the design, and say so.
  if (l.isSample) {
    const b = l.kind === 'musician' ? l.verification === 'verified' : l.kind === 'studio' && l.verification !== 'none';
    return b ? `<span class="vb" title="Sample badge, not a real verification">${SEAL}<span class="sr-only">Sample badge, not a real verification</span></span>` : '';
  }
  if (l.kind === 'musician' && l.verification === 'verified')
    return `<span class="vb" title="Opus Verified">${SEAL}<span class="sr-only">Opus Verified</span></span>`;
  if (l.kind === 'studio' && l.verification === 'studio') return `<span class="vb" title="Opus Studio Verified">${SEAL}<span class="sr-only">Opus Studio Verified</span></span>`;
  if (l.kind === 'studio' && l.verification === 'identity') return `<span class="vchip">ID verified</span>`;
  return '';
}

/** What a listing is, in a few words: Primary Specialty, studio type, or organization category. */
export function kindLabel(l: Listing): string {
  if (l.kind === 'musician') return SPECIALTIES[l.primarySpecialty]?.label ?? '';
  if (l.kind === 'studio') return l.studioType === 'home' ? 'Home studio' : l.studioType === 'remote' ? 'Remote services' : 'Recording studio';
  return ORG_CATEGORY_LABEL[l.category];
}

export function placeText(l: Listing): string {
  const loc = l.location;
  if (loc.precision === 'hidden') return 'Location not shown';
  if (loc.precision === 'region') return [loc.region, loc.countryName ?? loc.country].filter(Boolean).join(', ');
  return loc.region ? `${loc.city}, ${loc.region}` : `${loc.city}, ${loc.countryName ?? loc.country}`;
}

/** The main image for a card or preview: portrait, studio cover, or organization cover. */
export const mainImage = (l: Listing) => (l.kind === 'musician' ? l.photo : l.cover ?? l.photo);

export const PIN = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
const STAR = '<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>';

const tags = (xs: string[], n = 3) => (xs.length ? `<ul class="wc__tags">${xs.slice(0, n).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');

/** Price line for studios. Real prices come from the studio's services; sample rates say so. */
export function priceHtml(l: Listing): string {
  if (l.kind !== 'studio') return '';
  if (l.priceFrom) return `<p class="wc__price">From <b>${esc(l.priceFrom)}</b></p>`;
  if (l.hourlyRate) return `<p class="wc__price"><b>$${l.hourlyRate.amount}</b>/hr<span> · sample rate</span></p>`;
  return '';
}
/** Only shown when real reviews exist. Opus has no reviews yet, so this renders nothing today. */
export const ratingHtml = (l: Listing) =>
  l.kind === 'studio' && l.rating && l.rating.count > 0 ? `<span class="wc__rating">${STAR}${l.rating.value.toFixed(1)} <span>(${l.rating.count})</span></span>` : '';

/** One short line on what you can do now: collaborate, request a session, or nothing (then omitted). */
export function statusHtml(l: Listing): string {
  if (l.kind === 'musician') return l.openToCollab ? '<p class="wc__status is-live">Open to collaborate</p>' : '';
  if (l.kind === 'studio' && l.acceptsBookingRequests && !l.isSample) return '<p class="wc__status is-live">Taking session requests</p>';
  return '';
}

/** What they do, in one line: specialty and genres, studio type, or organization category. */
export function metaText(l: Listing): string {
  if (l.kind === 'musician') return [kindLabel(l), l.genres.slice(0, 2).join(', ')].filter(Boolean).join(' · ');
  return kindLabel(l);
}

/**
 * DirectoryCard. One markup for every view: Split and Map show it compact (square thumbnail),
 * List view lays the same card out as an editorial tile (4:3 image on top).
 * The name is a real button, stretched over the card, so it works with keyboard and screen readers.
 */
export function cardHtml(l: Listing): string {
  const sample = l.isSample ? '<span class="wc__sample">Sample</span>' : '';
  const what = metaText(l);
  const media = imageHtml({ src: mainImage(l), seed: l.id, kind: l.kind, ratio: 'photo', label: l.isSample ? undefined : initials(l.name) });
  let extra = '';
  if (l.kind === 'musician') extra = l.highlight ? `<p class="wc__note">${esc(l.highlight)}</p>` : '';
  if (l.kind === 'studio') extra = `<div class="wc__row">${priceHtml(l)}${ratingHtml(l)}</div>${tags(l.services)}`;
  if (l.kind === 'organization') extra = `${l.summary ? `<p class="wc__note">${esc(l.summary)}</p>` : ''}${tags(l.services)}`;
  return `<article class="wc wc--${l.kind}" data-id="${esc(l.id)}">
  <div class="wc__media">${media}</div>
  <div class="wc__body">
    <div class="wc__top"><h3 class="wc__name"><button type="button" class="wc__hit" data-open aria-label="${esc(l.name)}, ${esc(what)}, ${esc(placeText(l))}${l.isSample ? ', sample listing' : ''}. Open preview">${esc(l.name)}</button></h3>${badgeHtml(l)}${sample}</div>
    <p class="wc__meta">${esc(what)}</p>
    <p class="wc__where">${PIN}<span>${esc(placeText(l))}</span></p>
    ${extra}
    ${statusHtml(l)}
  </div>
</article>`;
}
