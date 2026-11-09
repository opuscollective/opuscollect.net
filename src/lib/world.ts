/** Pure helpers shared by the server render and the browser. No DOM access here. */
import { ORG_CATEGORY_LABEL, type Listing, type ListingKind } from '@/types/directory';
import { SPECIALTIES, allSpecialties, type Specialty } from '@/data/specialties';
import { esc } from './html';

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
    countries: new Set(listings.map((l) => l.location.country)).size,
    verified: listings.filter((l) => l.kind === 'musician' && l.verification === 'verified').length,
    organizations: listings.filter((l) => l.kind === 'organization').length,
  };
}

/** City-level aggregation for the homepage globe. */
export function byCity(listings: Listing[]) {
  const m = new Map<string, { city: string; country: string; lat: number; lng: number; count: number }>();
  for (const l of listings) {
    if (l.onMap === false) continue;
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
const initials = (s: string) => {
  const num = s.match(/(\d+)\s*$/)?.[1];
  if (/^Sample\s/.test(s) && num) return num;
  return s.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
};

const SEAL =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="s" d="M12 1.8l2.3 1.7 2.85-.2.9 2.7 2.35 1.6-.9 2.73.9 2.73-2.35 1.6-.9 2.7-2.85-.2L12 22.2l-2.3-1.7-2.85.2-.9-2.7-2.35-1.6.9-2.73-.9-2.73 2.35-1.6.9-2.7 2.85.2z"/><path class="c" d="M8 12.2l2.6 2.6L16.2 9"/></svg>';

export function badgeHtml(l: Listing): string {
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
  return loc.region ? `${loc.city}, ${loc.region}` : `${loc.city}, ${loc.country}`;
}

/** One short line on what you can do now: collaborate, book, or nothing (then omitted). */
function statusHtml(l: Listing): string {
  if (l.kind === 'musician') return l.openToCollab ? '<p class="wc__status is-live">Open to collaborate</p>' : '';
  if (l.kind === 'studio') {
    if (l.priceFrom) return `<p class="wc__status is-live">Taking requests<span> · from ${esc(l.priceFrom)}</span></p>`;
    if (l.hourlyRate) return `<p class="wc__status">$${l.hourlyRate.amount}/hr<span> · sample rate</span></p>`;
  }
  return '';
}

const ARROW = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>';

/** Result card: photo, name, verification, what they do, where, and availability. Click selects on the map; the arrow opens the profile. */
export function cardHtml(l: Listing): string {
  const sample = l.isSample ? '<span class="wc__sample">Sample</span>' : '';
  const av = l.photo
    ? `<img class="wc__av wc__av--${l.kind}" src="${esc(l.photo)}" alt="" loading="lazy" width="48" height="48" />`
    : `<div class="wc__av wc__av--${l.kind}" aria-hidden="true">${esc(initials(l.name))}</div>`;
  const what = esc(kindLabel(l));
  const open = l.href
    ? `<a class="wc__open" href="${esc(l.href)}" aria-label="Open ${esc(l.name)}${l.kind === 'studio' ? ' studio page' : ' profile'}">${ARROW}</a>`
    : '';
  return `<article class="wc wc--${l.kind}" data-id="${l.id}" tabindex="0" aria-label="${esc(l.name)}, ${what}, ${esc(placeText(l))}${l.isSample ? ', sample listing' : ''}">
  ${av}
  <div class="wc__body">
    <div class="wc__top"><h3 class="wc__name">${esc(l.name)}</h3>${badgeHtml(l)}${sample}</div>
    <p class="wc__meta">${what}<span aria-hidden="true"> · </span>${esc(placeText(l))}</p>
    ${statusHtml(l)}
  </div>
  ${open}
</article>`;
}
