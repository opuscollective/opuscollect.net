/**
 * The entrance from the homepage into World.
 *
 * The homepage Earth (globe.gl) and World's map (MapLibre) are two engines, so they can't share a canvas.
 * Instead the handoff is exact: the homepage camera stops, writes down where it is, and World opens its map
 * at the same centre and the same apparent size on screen. Until the map has drawn, the page shows the
 * homepage's own last frame in the same place (see WorldApp.astro), then crossfades to the live map.
 */
import type { Handoff } from '@/scripts/hero-globe';
import type { Camera } from '@/scripts/world-map';

const KEY = 'opus.enter';
/** A handoff older than this is from some earlier visit, not this click. */
const FRESH_MS = 20_000;

/** The homepage camera, once: read and forgotten, so a reload opens World normally. */
export function takeHandoff(): Handoff | null {
  try {
    const h = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Handoff | null;
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(`${KEY}.img`);
    return h && Date.now() - h.at < FRESH_MS ? h : null;
  } catch { return null; }
}

/** MapLibre's default vertical field of view (degrees). */
const MAP_FOV = 36.8699;

/**
 * The MapLibre camera that shows the globe exactly as the homepage left it.
 * - Homepage: a sphere of radius 1 seen from 1 + altitude away; its outline is
 *   (h/2) / tan(fov/2) / sqrt(d² - 1) pixels in radius.
 * - MapLibre: the globe's radius is 512·2^zoom / 2π / cos(lat) pixels at the centre, seen from
 *   cameraToCenterDistance + R away. Solving its outline for the same pixels gives R, then the zoom.
 * - Where the homepage globe sat on screen (right of the words; below the header) becomes map padding, so the
 *   sphere opens at the same spot even though World's map box is a different shape.
 */
export function cameraFor(h: Handoff, mapEl: HTMLElement, padBottom = 0): { camera: Camera; pad: { top: number; bottom: number; left: number; right: number } } {
  const rect = mapEl.getBoundingClientRect();
  const H = rect.height || h.h;
  const d = 1 + h.altitude;
  const outline = (h.h / 2) / Math.tan((h.fov * Math.PI) / 360) / Math.sqrt(d * d - 1);
  const f = H / 2 / Math.tan((MAP_FOV * Math.PI) / 360);
  const R = (outline * outline + outline * Math.sqrt(outline * outline + f * f)) / f;
  const zoom = Math.log2((R * Math.cos((h.lat * Math.PI) / 180) * 2 * Math.PI) / 512);
  const shift = 2 * (h.top + h.h / 2 - rect.top) - H + padBottom;
  const W = rect.width || h.w;
  const shiftX = 2 * ((h.left ?? 0) + h.w / 2 - rect.left) - W;
  return { camera: { center: [h.lng, h.lat], zoom }, pad: { top: Math.max(0, shift), bottom: Math.max(0, -shift), left: Math.max(0, shiftX), right: Math.max(0, -shiftX) } };
}

// ---------- Where the visitor is connecting from ----------
const FROM_KEY = 'opus.world.from.v1';
/** Only a city name or "worldwide" is remembered, on this device. Never coordinates. */
export type From = { mode: 'city'; name: string } | { mode: 'world' };
export function readFrom(): From | null {
  try {
    const v = JSON.parse(localStorage.getItem(FROM_KEY) ?? 'null') as From | null;
    return v && (v.mode === 'world' || (v.mode === 'city' && typeof v.name === 'string')) ? v : null;
  } catch { return null; }
}
export function saveFrom(v: From) { try { localStorage.setItem(FROM_KEY, JSON.stringify(v)); } catch { /* private mode: ask again next time */ } }
