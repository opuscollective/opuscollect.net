/**
 * World map (MapLibre GL JS 5).
 * One canvas does both jobs: a 3D globe when zoomed out, and a flat street-level
 * map when zoomed into a city. The globe-to-map transition is built into MapLibre's
 * globe projection, so there is no hand-off between two libraries.
 *
 * Base layers:
 *  - Countries come from our own file (/data/countries-50m.json), so the globe works
 *    with no third-party tile service.
 *  - Streets, water and place names come from OpenFreeMap vector tiles (free, no key)
 *    and appear from zoom 4. If that service is unreachable the map still works.
 */
import maplibregl, { type GeoJSONSource, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { hasPoint, type Listing } from '@/types/directory';
import { sunAt, sunlight, dayAmount } from '@/lib/sun';
import { aggregate, levelForZoom, nextZoom, placePoints, type Aggregate, type GeoLevel } from '@/lib/world-geo';

const OFM = 'https://tiles.openfreemap.org';

/** Map colours come from the theme tokens (--map-* in styles/tokens.css), so the map follows Light and Dark. */
interface Palette { bg: string; land: string; border: string; water: string; park: string; road: string; roadMajor: string; building: string; label: string; horizon: string }

function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    bg: v('--map-bg', '#141416'),
    land: v('--map-land', '#1c1d21'),
    border: v('--map-border', 'rgba(214,220,230,0.18)'),
    water: v('--map-water', '#0e0f11'),
    park: v('--map-park', '#181a1c'),
    road: v('--map-road', '#26282d'),
    roadMajor: v('--map-road-major', '#31343b'),
    building: v('--map-building', '#202125'),
    label: v('--map-label', '#8e8890'),
    horizon: v('--map-horizon', '#16181c'),
  };
}

/**
 * The Earth from space, the same picture as the homepage globe: NASA Blue Marble where the sun is up,
 * city lights where it is night, with the same soft twilight band. Painted once into a canvas in Web Mercator
 * (the night side is a low-resolution mask, scaled up, so the edge stays soft) and repainted every few minutes.
 * The imagery is 4096 px around the Earth, so it is shown only while it is sharp (to zoom ~3) and then hands
 * over to the street map, which is sharp at every zoom.
 */
const EARTH_COORDS: [[number, number], [number, number], [number, number], [number, number]] = [[-180, 85.0511], [180, 85.0511], [180, -85.0511], [-180, -85.0511]];
const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
async function earthCanvas(size: 2048 | 4096) {
  const [day, night] = await Promise.all([loadImg(`/images/earth/day-mercator-${size}.webp`), loadImg(`/images/earth/night-mercator-${size}.webp`)]);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const paint = () => {
    const sun = sunAt(new Date());
    const M = 256;
    const mask = document.createElement('canvas'); mask.width = mask.height = M;
    const mctx = mask.getContext('2d')!;
    const px = mctx.createImageData(M, M);
    for (let y = 0; y < M; y++) {
      const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / M))) * 180) / Math.PI;
      for (let x = 0; x < M; x++) {
        const lng = -180 + ((x + 0.5) / M) * 360;
        px.data[(y * M + x) * 4 + 3] = Math.round((1 - dayAmount(sunlight(lat, lng, sun))) * 255);
      }
    }
    mctx.putImageData(px, 0, 0);
    // Night lights only where it is night, then laid over the day picture.
    const nightLayer = document.createElement('canvas'); nightLayer.width = nightLayer.height = size;
    const nctx = nightLayer.getContext('2d')!;
    nctx.drawImage(night, 0, 0, size, size);
    nctx.globalCompositeOperation = 'destination-in';
    nctx.imageSmoothingQuality = 'high';
    nctx.drawImage(mask, 0, 0, size, size);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(day, 0, 0, size, size);
    ctx.drawImage(nightLayer, 0, 0);
    nightLayer.width = 0; // free it now
  };
  paint();
  return { canvas, paint };
}

const sky = (C: Palette) => ({
  'sky-color': C.bg,
  // The same thin blue atmosphere as the homepage globe, fading out as you come down to a city.
  'horizon-color': '#a9c8ff',
  'fog-color': C.bg,
  'sky-horizon-blend': 0.6,
  'horizon-fog-blend': 0.6,
  'fog-ground-blend': 0.9,
  'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 3, 0.6, 5, 0] as maplibregl.ExpressionSpecification,
});

/** Repaints an existing map in the current theme, keeping its data, markers and camera. */
function applyPalette(map: maplibregl.Map, C: Palette) {
  const paint: [string, string, string][] = [
    ['bg', 'background-color', C.water], ['land', 'fill-color', C.land], ['omt-water', 'fill-color', C.water],
    ['omt-park', 'fill-color', C.park], ['omt-building', 'fill-color', C.building], ['omt-road-minor', 'line-color', C.road],
    ['omt-road-major', 'line-color', C.roadMajor], ['borders', 'line-color', C.border], ['omt-place', 'text-color', C.label],
    ['omt-place', 'text-halo-color', C.bg],
  ];
  for (const [id, prop, value] of paint) if (map.getLayer(id)) map.setPaintProperty(id, prop, value);
  map.setSky(sky(C));
}

function buildStyle(countries: GeoJSON.FeatureCollection): StyleSpecification {
  const C = readPalette();
  return {
    version: 8,
    projection: { type: 'globe' },
    // Lights the atmosphere around the globe, so it has the same blue rim as the homepage Earth.
    light: { anchor: 'map', position: [1.5, 90, 80] },
    glyphs: `${OFM}/fonts/{fontstack}/{range}.pbf`,
    sky: sky(C),
    sources: {
      countries: { type: 'geojson', data: countries },
      omt: { type: 'vector', url: `${OFM}/planet`, attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': C.water } },
      { id: 'land', type: 'fill', source: 'countries', paint: { 'fill-color': C.land } },
      // City detail (OpenFreeMap). Fades in as you zoom toward a city.
      { id: 'omt-water', type: 'fill', source: 'omt', 'source-layer': 'water', minzoom: 4, paint: { 'fill-color': C.water } },
      { id: 'omt-park', type: 'fill', source: 'omt', 'source-layer': 'park', minzoom: 8, paint: { 'fill-color': C.park } },
      { id: 'omt-building', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 13, paint: { 'fill-color': C.building } },
      { id: 'omt-road-minor', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 10,
        filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'tertiary']]],
        paint: { 'line-color': C.road, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 16, 3] } },
      { id: 'omt-road-major', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 5,
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]],
        paint: { 'line-color': C.roadMajor, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.4, 16, 5] } },
      { id: 'borders', type: 'line', source: 'countries', paint: { 'line-color': C.border, 'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.4, 6, 1], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.12, 3, 0.2, 4.5, 1] } },
      { id: 'omt-place', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 5,
        filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'suburb', 'neighbourhood']]],
        layout: { 'text-field': ['get', 'name:latin'], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 14, 13], 'text-letter-spacing': 0.04 },
        paint: { 'text-color': C.label, 'text-halo-color': C.bg, 'text-halo-width': 1.2 } },
    ],
  };
}

export interface Camera { center: [number, number]; zoom: number }

export interface WorldMapApi {
  setData(listings: Listing[]): void;
  flyToCity(lat: number, lng: number): void;
  flyToListing(l: Listing): void;
  /** Pan just enough to bring a listing into view, without changing the zoom the visitor chose. */
  ensureVisible(l: Listing): void;
  setActive(id: string | null): void;
  setHover(id: string | null): void;
  /** Marks the searched city with a quiet accent ring (null clears it). */
  setPlace(p: { lat: number; lng: number; name: string } | null): void;
  zoomOut(): void;
  /** Back to the whole globe. */
  resetView(): void;
  getCenter(): { lat: number; lng: number };
  getBounds(): maplibregl.LngLatBounds;
  getZoom(): number;
  getCamera(): Camera;
  resize(): void;
  /** After the entrance: drop the handoff framing, and either rest or let the globe turn slowly. */
  release(worldwide: boolean): void;
  /** Resolves once the map has drawn everything for the current view. */
  ready(): Promise<void>;
  /** Frees the WebGL context and all markers (List view). */
  destroy(): void;
}

export interface MapCallbacks {
  onSelect: (id: string) => void;
  onMove: () => void;
  /** A grouped marker (country, region, metro or cluster) was opened. */
  onGroup?: (name: string | null) => void;
}

export async function mountWorldMap(
  el: HTMLElement,
  initial: Listing[],
  cb: MapCallbacks,
  opts: { padBottom?: number; camera?: Camera | null; pad?: { top: number; bottom: number } } = {},
): Promise<WorldMapApi> {
  // Phones get the 2048 px Earth: a 4096 px canvas is near the limit some phone browsers allow.
  const earthP = earthCanvas(el.clientWidth < 700 ? 2048 : 4096).catch((err) => { console.warn('Earth imagery unavailable; showing the plain map.', err); return null; });
  const topo = (await fetch('/data/countries-50m.json').then((r) => r.json())) as Topology;
  const earth = await earthP;
  const countries = feature(topo, topo.objects.countries as GeometryCollection) as unknown as GeoJSON.FeatureCollection;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // About as large as the homepage globe, and still within what the 4096 px imagery shows sharply.
  const homeZoom = () => (el.clientWidth < 700 ? 1 : el.clientWidth > 1400 ? 2.1 : 1.8);

  const map = new maplibregl.Map({
    container: el,
    style: buildStyle(countries),
    center: opts.camera?.center ?? [-40, 28],
    zoom: opts.camera?.zoom ?? homeZoom(),
    minZoom: 0.4,
    maxZoom: 17,
    attributionControl: { compact: true },
    dragRotate: false,
    pitchWithRotate: false,
    renderWorldCopies: false,
  });
  map.touchZoomRotate.disableRotation();
  // On phones the bottom sheet covers the lower edge; centre the globe in the visible area.
  if (opts.padBottom) map.setPadding({ top: 0, left: 0, right: 0, bottom: opts.padBottom });
  // Coming from the homepage: the globe sits exactly where the homepage camera left it (see world-entry.ts).
  if (opts.pad) map.setPadding({ top: opts.pad.top, left: 0, right: 0, bottom: (opts.padBottom ?? 0) + opts.pad.bottom });
  const firstIdle = new Promise<void>((res) => map.once('idle', () => res()));
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  const onTheme = () => { if (map.isStyleLoaded()) applyPalette(map, readPalette()); else map.once('load', () => applyPalette(map, readPalette())); };
  window.addEventListener('opus:theme', onTheme);

  // Missing third-party tiles should not break the map. Log once and continue.
  let warned = false;
  map.on('error', (e) => {
    if (!warned) { warned = true; console.warn('Map tile source unavailable; showing base layers only.', e.error?.message); }
  });

  // ---- Data by level: Country → Region → Metro → City/Suburb (see lib/world-geo) ----
  let data = initial;
  let level: GeoLevel = levelForZoom(map.getZoom());
  const groups = new Map<string, Aggregate>();
  function toGeo(): GeoJSON.FeatureCollection {
    groups.clear();
    if (level === 'place') {
      return {
        type: 'FeatureCollection',
        features: placePoints(data).map((p) => ({
          type: 'Feature', properties: { id: p.id, kind: p.kind, approx: p.approx, n: 1 }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        })),
      };
    }
    const aggs = aggregate(data, level);
    for (const a of aggs) groups.set(a.key, a);
    return {
      type: 'FeatureCollection',
      features: aggs.map((a) => ({ type: 'Feature', properties: { agg: a.key, n: a.count }, geometry: { type: 'Point', coordinates: [a.lng, a.lat] } })),
    };
  }

  await new Promise<void>((res) => map.on('load', () => res()));
  if (earth) {
    // The Earth from space, under the street map, handing over to it before the imagery could soften.
    map.addSource('earth', { type: 'canvas', canvas: earth.canvas, coordinates: EARTH_COORDS, animate: false });
    map.addLayer({ id: 'earth', type: 'raster', source: 'earth',
      paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 0, 1, 3.1, 1, 3.9, 0], 'raster-fade-duration': 0, 'raster-resampling': 'linear' } }, 'omt-water');
  }
  // Keep the night side where it really is: repaint the Earth every five minutes.
  const sunTimer = earth ? setInterval(() => {
    earth.paint();
    const src = map.getSource('earth') as maplibregl.CanvasSource | undefined;
    if (src) { src.play(); requestAnimationFrame(() => src.pause()); }
  }, 5 * 60_000) : 0;

  // Groups that would overlap on screen merge into one count (summed), then split as you zoom in.
  map.addSource('listings', {
    type: 'geojson', data: toGeo(), cluster: true, clusterRadius: 46, clusterMaxZoom: 13,
    clusterProperties: { n: ['+', ['get', 'n']] },
  });
  // Invisible layer so querySourceFeatures has something to read; markers are HTML for full styling control.
  map.addLayer({ id: 'listings-hit', type: 'circle', source: 'listings', paint: { 'circle-radius': 0, 'circle-opacity': 0 } });

  // ---- MapMarker: HTML markers for listings, groups and clusters ----
  const markers = new Map<string, maplibregl.Marker>();
  let onScreen = new Map<string, maplibregl.Marker>();
  let active: string | null = null;
  let hover: string | null = null;
  const size = (n: number) => String(Math.round(Math.min(54, 28 + Math.sqrt(n) * 3.6)));

  type SrcFeature = ReturnType<typeof map.querySourceFeatures>[number];
  function makeEl(f: SrcFeature): HTMLElement {
    const p = f.properties as Record<string, unknown>;
    const btn = document.createElement('button');
    btn.type = 'button';
    const at = (f.geometry as GeoJSON.Point).coordinates as [number, number];
    if (p.cluster) {
      const n = Number(p.n ?? p.point_count);
      btn.className = 'wm wm--cluster';
      btn.style.setProperty('--s', size(n));
      btn.innerHTML = '<span>' + n + '</span>';
      btn.setAttribute('aria-label', n + ' members here. Zoom in');
      btn.addEventListener('click', async (e) => {
        e.stopPropagation(); stop();
        const src = map.getSource('listings') as GeoJSONSource;
        const z = await src.getClusterExpansionZoom(Number(p.cluster_id));
        map.easeTo({ center: at, zoom: Math.min(z + 0.4, 16), duration: reduce ? 0 : 700 });
        cb.onGroup?.(null);
      });
    } else if (p.agg) {
      const a = groups.get(String(p.agg))!;
      btn.className = 'wm wm--agg wm--' + a.level;
      btn.dataset.agg = a.key;
      btn.style.setProperty('--s', size(a.count));
      btn.innerHTML = '<span>' + a.count + '</span><em>' + a.name.replace(/[&<>"]/g, '') + '</em>';
      btn.setAttribute('aria-label', a.count + ' in ' + a.name + '. Show them');
      btn.addEventListener('click', (e) => {
        e.stopPropagation(); stop();
        const [w, s, ea, n] = a.bounds;
        const z = nextZoom(a.level);
        if (ea - w < 0.05 && n - s < 0.05) map.flyTo({ center: [a.lng, a.lat], zoom: z, duration: reduce ? 0 : 900, essential: true });
        else map.fitBounds([[w, s], [ea, n]], { padding: 90, maxZoom: z, duration: reduce ? 0 : 900 });
        cb.onGroup?.(a.name);
      });
    } else {
      btn.className = 'wm wm--' + p.kind + (p.approx ? ' wm--approx' : '');
      btn.dataset.id = String(p.id);
      btn.setAttribute('aria-label', 'Show listing ' + p.id);
      btn.innerHTML = '<i></i>';
      btn.addEventListener('click', (e) => { e.stopPropagation(); stop(); cb.onSelect(String(p.id)); });
    }
    return btn;
  }

  function renderMarkers() {
    const next = new Map<string, maplibregl.Marker>();
    for (const f of map.querySourceFeatures('listings')) {
      const p = f.properties as Record<string, unknown>;
      const key = p.cluster ? 'c' + p.cluster_id + ':' + p.n : p.agg ? String(p.agg) : String(p.id);
      if (next.has(key)) continue;
      // Right after a level change the source can still return the previous level's features for a frame.
      if (p.agg && !groups.has(String(p.agg))) continue;
      if (!p.cluster && !p.agg && level !== 'place') continue;
      let m = markers.get(key);
      if (!m) {
        m = new maplibregl.Marker({ element: makeEl(f) }).setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number]);
        markers.set(key, m);
      }
      next.set(key, m);
      if (!onScreen.has(key)) m.addTo(map);
    }
    for (const [k, m] of onScreen) if (!next.has(k)) m.remove();
    onScreen = next;
    paintStates();
  }

  /** The selected or hovered listing lights up its own marker, or the group that holds it. */
  function paintStates() {
    for (const [k, m] of onScreen) {
      const e = m.getElement();
      const g = groups.get(k);
      e.classList.toggle('is-active', g ? !!active && g.ids.includes(active) : k === active);
      e.classList.toggle('is-hover', g ? !!hover && g.ids.includes(hover) : k === hover);
    }
  }

  function refreshData() {
    (map.getSource('listings') as GeoJSONSource).setData(toGeo());
    for (const m of onScreen.values()) m.remove();
    onScreen.clear(); markers.clear();
  }

  let raf = 0;
  // Throttle (not debounce): during continuous animation a debounce would never fire.
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; renderMarkers(); }); };
  map.on('render', () => { if (map.isSourceLoaded('listings')) schedule(); });
  map.on('zoom', () => { const l = levelForZoom(map.getZoom()); if (l !== level) { level = l; refreshData(); } });
  map.on('moveend', () => cb.onMove());

  // Slow idle spin on the globe until the visitor touches the map (first visit only, never when restoring a view).
  let spinning = !reduce && !opts.camera;
  const spin = () => {
    if (!spinning || map.getZoom() > 2.6) return;
    const c = map.getCenter();
    map.easeTo({ center: [c.lng + 4, c.lat], duration: 1000, easing: (t) => t });
  };
  map.on('moveend', () => spinning && spin());
  const stop = () => { spinning = false; };
  ['mousedown', 'touchstart', 'wheel', 'dragstart'].forEach((ev) => map.on(ev as 'mousedown', stop));
  spin();

  let place: maplibregl.Marker | null = null;

  return {
    setData(ls) { data = ls; refreshData(); },
    flyToCity(lat, lng) { stop(); map.flyTo({ center: [lng, lat], zoom: 10.2, speed: 1.1, curve: 1.6, essential: true, ...(reduce ? { duration: 0 } : {}) }); },
    flyToListing(l) { stop(); map.flyTo({ center: [l.location.lng, l.location.lat], zoom: Math.max(map.getZoom(), l.location.precision === 'approximate' ? 11 : 12.5), duration: reduce ? 0 : 900 }); },
    ensureVisible(l) {
      if (!hasPoint(l) || l.onMap === false) return;
      if (map.getBounds().contains([l.location.lng, l.location.lat])) return;
      stop(); map.easeTo({ center: [l.location.lng, l.location.lat], duration: reduce ? 0 : 700 });
    },
    setActive(id) { active = id; paintStates(); },
    setHover(id) { hover = id; paintStates(); },
    setPlace(p) {
      place?.remove(); place = null;
      if (!p) return;
      const pe = document.createElement('div');
      pe.className = 'wm-place';
      pe.setAttribute('aria-hidden', 'true');
      pe.innerHTML = '<i></i><span>' + p.name.replace(/[&<>"]/g, '') + '</span>';
      place = new maplibregl.Marker({ element: pe }).setLngLat([p.lng, p.lat]).addTo(map);
    },
    resetView() { stop(); map.flyTo({ zoom: homeZoom(), duration: reduce ? 0 : 1100, essential: true }); },
    zoomOut() { stop(); map.easeTo({ zoom: Math.max(1.2, map.getZoom() - 3), duration: reduce ? 0 : 800 }); },
    getCenter: () => { const c = map.getCenter(); return { lat: c.lat, lng: c.lng }; },
    getBounds: () => map.getBounds(),
    getZoom: () => map.getZoom(),
    getCamera: () => { const c = map.getCenter(); return { center: [c.lng, c.lat], zoom: map.getZoom() }; },
    resize: () => map.resize(),
    release(worldwide) {
      const padding = { top: 0, left: 0, right: 0, bottom: opts.padBottom ?? 0 };
      // Worldwide: settle back to the whole globe and let it turn. Otherwise just drop the handoff framing.
      map.easeTo({ padding, ...(worldwide ? { zoom: Math.min(map.getZoom(), el.clientWidth < 700 ? 1.3 : Math.max(homeZoom(), 2.3)) } : {}), duration: reduce ? 0 : 1100 });
      if (worldwide && !reduce) spinning = true; // the moveend handler starts the spin
    },
    ready: () => firstIdle,
    destroy() { clearInterval(sunTimer); window.removeEventListener('opus:theme', onTheme); stop(); cancelAnimationFrame(raf); place?.remove(); for (const m of onScreen.values()) m.remove(); map.remove(); },
  };
}
