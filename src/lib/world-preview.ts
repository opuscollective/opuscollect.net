/**
 * ProfilePreview and ProfileGallery: the expanded profile shown when a card or marker is opened.
 * Pure HTML builders (no DOM), so the same markup works in the split panel, the List view drawer
 * and the phone bottom sheet. Every string from the server is escaped.
 */
import { HIRE_ENABLED } from './features.ts';
import type { Listing } from '@/types/directory';
import type { ProfileDetail, PreviewAction } from '@/server/world-detail';
import { esc } from './html';
import { imageHtml } from './media';
import { PIN, badgeHtml, initials, kindLabel, mainImage, placeText, priceHtml, ratingHtml } from './world';
import { SPECIALTIES, allSpecialties } from '@/data/specialties';

const section = (title: string, body: string) => (body ? `<section class="pv__sec"><h3>${esc(title)}</h3>${body}</section>` : '');
const chips = (xs: string[]) => (xs.length ? `<ul class="pv__chips">${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
const EXT = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>';
const PLAY = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13l11-6.5z"/></svg>';

/** A button only looks live when it does something. Otherwise it is disabled and says why. */
function actionHtml(a: PreviewAction, primary: boolean): string {
  const cls = primary ? 'pv__btn' : 'pv__btn pv__btn--quiet';
  if (a.href) return `<a class="${cls}" href="${esc(a.href)}">${esc(a.label)}</a>`;
  return `<button type="button" class="${cls}" disabled aria-describedby="pv-why">${esc(a.label)}</button>`;
}

/** ProfileGallery: a scroll-snapping strip of fixed-ratio photos. */
export function galleryHtml(images: string[], seed: string, name: string): string {
  if (!images.length) return '';
  const items = images.map((src, i) => `<li>${imageHtml({ src, seed: `${seed}-g${i}`, kind: 'gallery', ratio: 'photo', alt: `${name}, photo ${i + 1} of ${images.length}` })}</li>`).join('');
  return `<div class="pg" data-gallery>
  <ul class="pg__strip" tabindex="0" aria-label="Photos of ${esc(name)}">${items}</ul>
  ${images.length > 1 ? `<div class="pg__nav"><button type="button" data-g="-1" aria-label="Previous photo">‹</button><button type="button" data-g="1" aria-label="Next photo">›</button></div>` : ''}
</div>`;
}

export function previewHtml(l: Listing, d: ProfileDetail): string {
  const hero = imageHtml({ src: mainImage(l), seed: l.id, kind: l.kind, ratio: l.kind === 'musician' ? 'portrait' : 'wide', alt: l.kind === 'musician' ? `Photo of ${l.name}` : `${l.name}`, eager: true, label: l.isSample ? undefined : initials(l.name) });
  const sample = l.isSample ? '<span class="wc__sample">Sample</span>' : '';

  let roles = '';
  let status = '';
  let conns = '';
  if (l.kind === 'musician') {
    // The card names the Primary Specialty only; the rest live in About on the profile.
    const sp = allSpecialties(l.primarySpecialty, l.specialties).slice(0, 1).map((s) => SPECIALTIES[s]?.label ?? s);
    roles = `<p class="pv__roles">${sp.map((s, i) => `<span${i === 0 ? ' class="is-primary"' : ''}>${esc(s)}</span>`).join('')}</p>${l.genres.length ? `<p class="pv__genres">${esc(l.genres.join(' · '))}</p>` : ''}`;
    status = HIRE_ENABLED && l.forHire ? '<p class="wc__status is-live">For hire</p>' : '';
    // One quiet line with the city: "Birmingham, AL · 12 connections".
    if (typeof d.connections === 'number' && d.connections > 0 && !l.isSample) conns = `<span class="pv__cn">${d.connections.toLocaleString('en-US')} ${d.connections === 1 ? 'connection' : 'connections'}</span>`;
  } else {
    roles = `<p class="pv__roles"><span class="is-primary">${esc(kindLabel(l))}</span></p>`;
    if (l.kind === 'studio') {
      const price = priceHtml(l);
      status = `<div class="pv__price">${price}${ratingHtml(l)}</div>${l.acceptsBookingRequests && !l.isSample ? '<p class="wc__status is-live">Taking session requests</p>' : ''}`;
    }
  }

  const why = d.actions.primary.disabledReason ?? d.actions.profile.disabledReason;
  const actions = `<div class="pv__actions">${actionHtml(d.actions.primary, true)}${actionHtml(d.actions.profile, false)}</div>${why ? `<p class="pv__why" id="pv-why">${esc(why)}${d.isSample ? '. Actions turn on for real members.' : '.'}</p>` : ''}`;

  const bio = d.bio ? `<p class="pv__bio">${esc(d.bio)}</p>` : '';
  let body = '';
  if (l.kind === 'musician') {
    const featured = d.featured.map((f) => `<li><a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer"><span class="pv__play">${PLAY}</span><span><b>${esc(f.title)}</b><small>${esc(f.platform)}</small></span>${EXT}</a></li>`).join('');
    const credits = d.credits.map((c) => {
      const t = `<b>${esc(c.title)}</b><small>${esc([c.role, c.artist, c.year].filter(Boolean).join(' · '))}</small>`;
      return `<li>${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${t}</a>` : `<span>${t}</span>`}</li>`;
    }).join('');
    // Releases as covers, with the title and year on the artwork. No artwork: a quiet tinted tile carries the same words.
    const rel = (d.releases ?? []).map((r, i) => `<li><a href="${esc(r.url)}" title="${esc(r.meta)}"${r.cover ? '' : ` class="is-blank" style="--h:${(i * 47 + 210) % 360}"`}>${r.cover ? `<img src="${esc(r.cover)}" alt="" loading="lazy" decoding="async">` : ''}<span class="pv__cv"><b>${esc(r.title)}</b>${r.year ? `<small>${esc(r.year)}</small>` : ''}</span></a></li>`).join('');
    const links = d.links.map((x) => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.label)}${EXT}</a></li>`).join('');
    body = section('About', bio)
      + section('Releases', rel ? `<ul class="pv__covers" role="list">${rel}</ul>` : '')
      + section('Featured music', featured ? `<ul class="pv__list pv__list--media">${featured}</ul>` : '')
      + section('Selected credits', credits ? `<ul class="pv__list">${credits}</ul>` : '')
      + section('Highlights', d.achievements.length ? `<ul class="pv__bullets">${d.achievements.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : '')
      + section('Elsewhere', links ? `<ul class="pv__links">${links}</ul>` : '');
  } else if (l.kind === 'studio') {
    const services = d.services.map((s) => `<li><span><b>${esc(s.name)}</b><small>${esc([s.detail, s.description].filter(Boolean).join(' · '))}</small></span>${s.price ? `<em>${esc(s.price)}</em>` : ''}</li>`).join('');
    body = section('Gallery', galleryHtml(d.gallery, l.id, l.name))
      + section('About', bio)
      + section('Services', services ? `<ul class="pv__list pv__list--svc">${services}</ul>` : '')
      + section('Equipment', chips(d.equipment))
      + section('Reviews', l.rating && l.rating.count ? ratingHtml(l) : '<p class="pv__muted">No reviews yet. Reviews open with completed bookings.</p>');
  } else {
    body = section('About', bio)
      + section('Services', chips(l.services))
      + section(l.href?.startsWith('/c/') ? 'Members' : 'Selected projects', d.projects.length ? `<ul class="pv__bullets">${d.projects.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '');
  }

  // The photo carries over to the profile page as one element (cross-document view transition, see global.css).
  const hm = /^\/([A-Za-z0-9_-]+)$/.exec(d.actions.profile.href ?? '');
  const vt = hm ? ` style="view-transition-name:pf-${hm[1]}"` : '';
  const washSrc = mainImage(l);
  const wash = washSrc ? `<div class="pv__wash" aria-hidden="true" style="background-image:url('${esc(washSrc)}')"></div>` : '';
  return `<article class="pv pv--${l.kind}" aria-labelledby="pv-name">
  ${wash}<div class="pv__hero"${vt}>${hero}</div>
  <div class="pv__body">
    <header class="pv__head">
      <div class="pv__title"><h2 id="pv-name">${esc(l.name)}</h2>${badgeHtml(l)}${sample}</div>
      ${roles}
      <p class="wc__where">${PIN}<span>${esc(placeText(l))}</span>${conns}</p>
      ${status}
    </header>
    ${l.kind === 'musician' && !d.isSample ? '<div class="pv__overlap" data-pv-overlap hidden></div>' : ''}
    ${actions}
    ${body}
  </div>
</article>`;
}

export const previewSkeleton = (l?: Listing) => `<div class="pv pv--loading" aria-busy="true">
  <div class="pv__hero"><span class="im im--${l?.kind === 'musician' ? 'portrait' : 'wide'} is-skel"></span></div>
  <div class="pv__body">${l ? `<header class="pv__head"><div class="pv__title"><h2 id="pv-name">${esc(l.name)}</h2></div><p class="pv__roles"><span class="is-primary">${esc(kindLabel(l))}</span></p></header>` : ''}
    <span class="pv__skel"></span><span class="pv__skel"></span><span class="pv__skel pv__skel--short"></span>
  </div>
</div>`;

export const previewError = (msg: string, retry: boolean) => `<div class="pv pv--error" role="alert">
  <div class="pv__body"><p class="wp__empty-title">${esc(msg)}</p>
  <div class="wp__empty-actions">${retry ? '<button type="button" class="wp__btn" data-preview-retry>Try again</button>' : ''}<button type="button" class="wp__btn wp__btn--quiet" data-preview-close>Back to results</button></div></div>
</div>`;

/** What the signed-in visitor shares with this member (see /api/world/:id/overlap). Empty string when nothing overlaps. */
export interface OverlapView { connected?: boolean; mutualCount: number; mutuals: { handle: string; name: string; photo: string | null }[]; works: { id: string; title: string; cover: string | null; year: string }[] }
/** One quiet row: overlapping faces of mutual connections and covers of shared works, then one line naming them. */
export function overlapHtml(o: OverlapView): string {
  if (o.mutualCount <= 0 && o.works.length === 0) return '';
  const faces = o.mutuals.slice(0, 3).map((m) => `<a href="/${esc(m.handle)}" title="${esc(m.name)}"${m.photo ? ` style="background-image:url('${esc(m.photo)}')"` : ''}>${m.photo ? '' : esc(m.name.slice(0, 1))}</a>`).join('');
  const thumbs = o.works.slice(0, 3).map((w) => `<a class="is-sq" href="/r/${esc(w.id)}" title="${esc(w.title)}"${w.cover ? ` style="background-image:url('${esc(w.cover)}')"` : ''}>${w.cover ? '' : esc(w.title.slice(0, 1))}</a>`).join('');
  const list = (xs: string[], total: number, more: string) => xs.map((x) => `<b>${esc(x)}</b>`).join(', ') + (total > xs.length ? ` and ${total - xs.length} ${more}` : '');
  const parts: string[] = [];
  if (o.mutualCount > 0) {
    const names = o.mutuals.slice(0, 2).map((m) => m.name.split(' ')[0]!);
    parts.push(names.length ? `You both know ${list(names, o.mutualCount, o.mutualCount - names.length === 1 ? 'other' : 'others')}` : `${o.mutualCount} mutual ${o.mutualCount === 1 ? 'connection' : 'connections'}`);
  }
  if (o.works.length > 0) parts.push(`Together on ${list(o.works.slice(0, 2).map((w) => w.title), o.works.length, 'more')}`);
  return `${faces || thumbs ? `<span class="pv__ovf">${faces}${thumbs}</span>` : ''}<p class="pv__ov">${parts.join('<i aria-hidden="true"> · </i>')}</p>`;
}
