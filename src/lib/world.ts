/** Pure helpers shared by the server render and the browser. No DOM access here. */
import { ORG_CATEGORY_LABEL, hasPoint, type Listing, type ListingKind } from '@/types/directory';
import { SPECIALTIES, allSpecialties, type Specialty } from '@/data/specialties';
import { esc } from './html';
import { imageHtml } from './media';
import { keywordTokens, matchesKeywords } from './keywords';

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
  const words = keywordTokens(f.text);
  if (words.length) {
    const hay = [l.name, l.slug, l.location.city, l.metro?.name ?? '', l.location.region ?? '', l.location.country, kindLabel(l), ...(l.kind === 'musician' ? [...l.genres, ...allSpecialties(l.primarySpecialty, l.specialties).map((s) => SPECIALTIES[s].label)] : l.services)]
      .join(' ');
    if (!matchesKeywords(hay, words)) return false;
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
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="s" d="M14.54 2.53A4.2 4.2 0 0 1 18.93 5.07A4.2 4.2 0 0 1 21.47 9.46A4.2 4.2 0 0 1 21.47 14.54A4.2 4.2 0 0 1 18.93 18.93A4.2 4.2 0 0 1 14.54 21.47A4.2 4.2 0 0 1 9.46 21.47A4.2 4.2 0 0 1 5.07 18.93A4.2 4.2 0 0 1 2.53 14.54A4.2 4.2 0 0 1 2.53 9.46A4.2 4.2 0 0 1 5.07 5.07A4.2 4.2 0 0 1 9.46 2.53A4.2 4.2 0 0 1 14.54 2.53Z"/><path class="c" d="M8.4 12.3l2.4 2.4 4.9-5"/></svg>';

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

/**
 * Tile: the visual card, used everywhere a member is shown in World.
 * 'grid': the directory, two to a row (image fills the card, words over it).
 * 'wide': the same card in the swipeable row over the map on phones.
 * 'portrait': city guide shelves (image on top, words below). The name is the button.
 */
export function tileHtml(l: Listing, variant: 'wide' | 'portrait' | 'grid'): string {
  const what = kindLabel(l);
  const over = variant !== 'portrait';
  const media = imageHtml({ src: mainImage(l), seed: l.id, kind: l.kind, ratio: variant === 'wide' ? 'photo' : 'portrait', label: l.isSample ? undefined : initials(l.name) });
  const sample = l.isSample ? '<span class="wt__sample">Sample</span>' : '';
  const status = l.kind === 'musician' && l.openToCollab ? '<span class="wt__live">Open to collaborate</span>' : '';
  return `<article class="wt wt--${variant}${variant === 'grid' ? ' wt--wide' : ''} wt--${l.kind}" data-id="${esc(l.id)}">
  <div class="wt__media">${media}</div>
  <div class="wt__body">
    <h3 class="wt__name"><button type="button" class="wt__hit" data-open aria-label="${esc(l.name)}, ${esc(what)}, ${esc(placeText(l))}${l.isSample ? ', sample listing' : ''}. Open preview"><span>${esc(l.name)}</span></button>${badgeHtml(l)}</h3>
    <p class="wt__meta">${esc(what)}${sample}</p>
    ${over ? `<p class="wt__where">${esc(placeText(l))}</p>` : status}
  </div>
</article>`;
}
