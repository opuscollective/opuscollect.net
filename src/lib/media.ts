/**
 * Reusable image handling for World: portraits, studio covers, galleries, organization logos.
 *
 * - Real images come from member uploads in R2 (/media/...). Uploads are resized and stripped of
 *   metadata in the browser and stripped again on the server.
 * - Every image sits in a fixed-ratio frame, so cards never jump while loading.
 * - Images lazy-load and decode off the main thread. A failed image falls back to the placeholder.
 * - Placeholders are generated artwork (no people, no places), so nothing invented looks like a
 *   real member's photo. Sample listings always use them, and say "Sample" next to the name.
 */
import { esc } from './html';
import type { ListingKind } from '@/types/directory';

export type Ratio = 'square' | 'photo' | 'wide' | 'portrait';

// Small deterministic hash, so the same listing always gets the same artwork.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Generated placeholder artwork in the Opus palette: graphite, with a quiet icy-blue light.
 * Musicians get sound rings, studios get acoustic panels, organizations get arcs.
 */
export function placeholderArt(seed: string, kind: ListingKind | 'gallery' = 'musician'): string {
  const h = hash(seed);
  const r = (n: number) => ((h >>> (n % 24)) % 1000) / 1000;
  const cx = Math.round(120 + r(1) * 200), cy = Math.round(60 + r(3) * 180);
  const tone = ['#181a20', '#1a191f', '#161a20', '#1b1a1e'][h % 4];
  const glow = 'rgba(169,199,236,' + (0.24 + r(5) * 0.12).toFixed(2) + ')';
  let motif = '';
  if (kind === 'musician') {
    for (let i = 1; i <= 7; i++) motif += '<circle cx="' + cx + '" cy="' + cy + '" r="' + i * 26 + '" fill="none" stroke="rgba(214,226,240,' + (0.16 - i * 0.016).toFixed(3) + ')" stroke-width="1"/>';
    let d = 'M0 ' + (220 + r(7) * 30).toFixed(0);
    for (let x = 0; x <= 400; x += 16) d += ' L' + x + ' ' + (232 + Math.sin(x / 22 + r(9) * 6) * (8 + r(11) * 14)).toFixed(1);
    motif += '<path d="' + d + '" fill="none" stroke="rgba(169,199,236,0.32)" stroke-width="1.4"/>';
  } else if (kind === 'studio' || kind === 'gallery') {
    const cols = 6 + (h % 4);
    const w = 400 / cols;
    for (let i = 0; i < cols; i++) {
      const hh = 120 + r(i + 2) * 120;
      motif += '<rect x="' + (i * w + 4).toFixed(1) + '" y="' + (300 - hh).toFixed(0) + '" width="' + (w - 8).toFixed(1) + '" height="' + hh.toFixed(0) + '" rx="3" fill="rgba(214,226,240,' + (0.045 + r(i + 5) * 0.05).toFixed(3) + ')"/>';
    }
    motif += '<line x1="0" y1="' + (90 + r(4) * 40).toFixed(0) + '" x2="400" y2="' + (70 + r(6) * 40).toFixed(0) + '" stroke="rgba(169,199,236,0.18)"/>';
  } else {
    for (let i = 0; i < 4; i++) motif += '<path d="M' + (40 + i * 30) + ' 300 A ' + (180 - i * 30) + ' ' + (180 - i * 30) + ' 0 0 1 ' + (400 - i * 20) + ' ' + (120 + i * 30) + '" fill="none" stroke="rgba(214,226,240,' + (0.1 - i * 0.02).toFixed(2) + ')"/>';
  }
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">'
    + '<defs><radialGradient id="g" cx="' + (cx / 4) + '%" cy="' + (cy / 3) + '%" r="70%"><stop offset="0" stop-color="' + glow + '"/><stop offset="1" stop-color="rgba(0,0,0,0)"/></radialGradient></defs>'
    + '<rect width="400" height="300" fill="' + tone + '"/><rect width="400" height="300" fill="url(#g)"/>' + motif + '</svg>';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

/** "art:<seed>" in data means "use generated artwork". */
export const resolveSrc = (src: string | undefined, seed: string, kind: ListingKind | 'gallery') =>
  !src || src.startsWith('art:') ? placeholderArt(src ? src.slice(4) : seed, kind) : src;

export interface ImageOpts {
  src?: string;
  seed: string;
  kind: ListingKind | 'gallery';
  ratio: Ratio;
  alt?: string;
  /** Above the fold: load now instead of lazily. */
  eager?: boolean;
  className?: string;
  /** Monogram over the placeholder (e.g. initials). */
  label?: string;
}

/** A fixed-ratio image frame with lazy loading and a generated fallback. */
export function imageHtml(o: ImageOpts): string {
  const fallback = placeholderArt(o.seed, o.kind);
  const isArt = !o.src || o.src.startsWith('art:');
  const src = isArt ? resolveSrc(o.src, o.seed, o.kind) : o.src!;
  const label = isArt && o.label ? '<span class="im__label" aria-hidden="true">' + esc(o.label) + '</span>' : '';
  return '<span class="im im--' + o.ratio + (isArt ? ' is-art' : '') + (o.className ? ' ' + o.className : '') + '">'
    + '<img src="' + esc(src) + '" alt="' + esc(o.alt ?? '') + '"' + (o.eager ? ' fetchpriority="high"' : ' loading="lazy"') + ' decoding="async" data-fallback="' + esc(fallback) + '" />'
    + label + '</span>';
}

/**
 * Call once per page: images that fail to load swap to their placeholder,
 * and loaded images fade in (unless reduced motion is on, handled in CSS).
 */
export function installImageFallbacks(root: Document | HTMLElement = document) {
  root.addEventListener('error', (e) => {
    const img = e.target as HTMLImageElement;
    if (img?.tagName !== 'IMG' || !img.dataset.fallback || img.src === img.dataset.fallback) return;
    img.src = img.dataset.fallback;
    img.closest('.im')?.classList.add('is-art');
  }, true);
  root.addEventListener('load', (e) => {
    const img = e.target as HTMLImageElement;
    if (img?.tagName === 'IMG') img.closest('.im')?.classList.add('is-loaded');
  }, true);
}
