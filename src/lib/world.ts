/** Pure helpers shared by the server render and the browser. No DOM access here. */
import type { Listing, ListingKind } from '@/types/directory';
import { SPECIALTIES, allSpecialties, type Specialty } from '@/data/specialties';
import { ORG_CATEGORY_LABEL } from '@/data/sample-world';

export interface WorldFilters {
  kinds: ListingKind[]; // empty = all
  specialty?: Specialty | '';
  genre?: string;
  openToCollab?: boolean;
  studioType?: 'commercial' | 'home' | '';
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
    const hay = [l.name, l.slug, l.location.city, l.location.region ?? '', l.location.country, ...(l.kind === 'musician' ? [...l.genres, ...allSpecialties(l.primarySpecialty, l.specialties).map((s) => SPECIALTIES[s].label)] : l.services)]
      .join(' ')
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

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
    const k = `${l.location.city}|${l.location.country}`;
    const e = m.get(k);
    if (e) e.count++;
    else m.set(k, { city: l.location.city, country: l.location.country, lat: l.location.lat, lng: l.location.lng, count: 1 });
  }
  return [...m.values()];
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]!);
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
  if (l.kind === 'studio' && l.verification === 'studio') return `<span class="vchip vchip--studio">${SEAL}Opus Studio Verified</span>`;
  if (l.kind === 'studio' && l.verification === 'identity') return `<span class="vchip">Identity Verified</span>`;
  return '';
}

/** Card markup used by both the static page and the client-side filter. */
export function cardHtml(l: Listing): string {
  const place = `${esc(l.location.city)}${l.location.region ? ', ' + esc(l.location.region) : ''} · ${esc(l.location.country)}`;
  const sample = l.isSample ? '<span class="wc__sample">Sample</span>' : '';
  let kindLabel = '';
  let note = '';
  let tags: string[] = [];
  let foot = '';
  if (l.kind === 'musician') {
    kindLabel = allSpecialties(l.primarySpecialty, l.specialties).map((d) => SPECIALTIES[d].label).join(' · ');
    tags = l.genres;
    foot =
      `<span class="wc__collab${l.openToCollab ? ' is-on' : ''}">${l.openToCollab ? 'Open to collab' : 'Not taking collabs'}</span>` +
      (l.highlight ? `<span class="wc__hl">${esc(l.highlight)}</span>` : '');
  } else if (l.kind === 'studio') {
    kindLabel = l.studioType === 'home' ? 'Home studio' : 'Commercial studio';
    tags = l.services;
    if (l.studioType === 'home') note = '<p class="wc__note">Approximate area. Exact address is shared only for a confirmed booking.</p>';
    foot =
      (l.hourlyRate ? `<span class="wc__rate">$${l.hourlyRate.amount}<small>/hr · sample rate</small></span>` : '') +
      `<span class="wc__gear">${esc(l.equipment.slice(0, 2).join(' · '))}</span>`;
  } else {
    kindLabel = ORG_CATEGORY_LABEL[l.category];
    tags = l.services;
  }
  return `<article class="wc wc--${l.kind}" data-id="${l.id}" tabindex="0" aria-label="${esc(l.name)}${l.isSample ? ', sample listing' : ''}">
  <div class="wc__av wc__av--${l.kind}" aria-hidden="true">${esc(initials(l.name))}</div>
  <div class="wc__body">
    <div class="wc__top"><h3 class="wc__name">${esc(l.name)}</h3>${badgeHtml(l)}${sample}</div>
    <p class="wc__kind">${esc(kindLabel)}</p>
    <p class="wc__place">${place}</p>
    ${note}
    <div class="wc__tags">${tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
    ${foot ? `<div class="wc__foot">${foot}</div>` : ''}
  </div>
</article>`;
}
