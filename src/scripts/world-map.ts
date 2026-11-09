/**
 * Opus World map (MapLibre GL JS 5).
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
import type { Listing } from '@/types/directory';

const OFM = 'https://tiles.openfreemap.org';

const C = {
  bg: '#050506',
  land: '#141518',
  border: 'rgba(214,220,230,0.18)',
  water: '#08090b',
  road: '#202227',
  roadMajor: '#2b2e35',
  building: '#191a1e',
  label: '#8e8890',
};

function buildStyle(countries: GeoJSON.FeatureCollection): StyleSpecification {
  return {
    version: 8,
    projection: { type: 'globe' },
    glyphs: `${OFM}/fonts/{fontstack}/{range}.pbf`,
    sky: {
      'sky-color': C.bg,
      'horizon-color': '#0c0e12',
      'fog-color': C.bg,
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.6,
      'fog-ground-blend': 0.9,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.35, 4, 0.2, 6, 0],
    },
    sources: {
      countries: { type: 'geojson', data: countries },
      omt: { type: 'vector', url: `${OFM}/planet`, attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': C.water } },
      { id: 'land', type: 'fill', source: 'countries', paint: { 'fill-color': C.land } },
      // City detail (OpenFreeMap). Fades in as you zoom toward a city.
      { id: 'omt-water', type: 'fill', source: 'omt', 'source-layer': 'water', minzoom: 4, paint: { 'fill-color': C.water } },
      { id: 'omt-park', type: 'fill', source: 'omt', 'source-layer': 'park', minzoom: 8, paint: { 'fill-color': '#121416' } },
      { id: 'omt-building', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 13, paint: { 'fill-color': C.building } },
      { id: 'omt-road-minor', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 10,
        filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'tertiary']]],
        paint: { 'line-color': C.road, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 16, 3] } },
      { id: 'omt-road-major', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 5,
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]],
        paint: { 'line-color': C.roadMajor, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.4, 16, 5] } },
      { id: 'borders', type: 'line', source: 'countries', paint: { 'line-color': C.border, 'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.4, 6, 1] } },
      { id: 'omt-place', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 5,
        filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'suburb', 'neighbourhood']]],
        layout: { 'text-field': ['get', 'name:latin'], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 14, 13], 'text-letter-spacing': 0.04 },
        paint: { 'text-color': C.label, 'text-halo-color': C.bg, 'text-halo-width': 1.2 } },
    ],
  };
}

export interface WorldMapApi {
  setData(listings: Listing[]): void;
  flyToCity(lat: number, lng: number): void;
  flyToListing(l: Listing): void;
  setActive(id: string | null): void;
  setHover(id: string | null): void;
  getBounds(): maplibregl.LngLatBounds;
  getZoom(): number;
  resize(): void;
}

export async function mountWorldMap(
  el: HTMLElement,
  initial: Listing[],
  cb: { onSelect: (id: string) => void; onMove: () => void },
  opts: { padBottom?: number } = {},
): Promise<WorldMapApi> {
  const topo = (await fetch('/data/countries-50m.json').then((r) => r.json())) as Topology;
  const countries = feature(topo, topo.objects.countries as GeometryCollection) as unknown as GeoJSON.FeatureCollection;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const map = new maplibregl.Map({
    container: el,
    style: buildStyle(countries),
    center: [-40, 28],
    zoom: el.clientWidth < 700 ? 0.85 : 1.5,
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
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

  // Missing third-party tiles should not break the map. Log once and continue.
  let warned = false;
  map.on('error', (e) => {
    if (!warned) { warned = true; console.warn('Map tile source unavailable; showing base layers only.', e.error?.message); }
  });

  // Members share public city/locality centre points, never home locations. When several share one
  // point, spread them on a small ring around it so each stays selectable when zoomed in. The ring is
  // derived only from the public point and the member's order, so it reveals nothing new.
  const toGeo = (ls: Listing[]): GeoJSON.FeatureCollection => {
    const groups = new Map<string, Listing[]>();
    for (const l of ls) {
      const k = `${l.location.lat.toFixed(4)},${l.location.lng.toFixed(4)}`;
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(l);
    }
    const features: GeoJSON.Feature[] = [];
    for (const g of groups.values()) {
      g.forEach((l, i) => {
        let { lat, lng } = l.location;
        if (g.length > 1) {
          const r = 0.006 * (1 + Math.floor(i / 8)); // degrees, roughly 600 m per ring
          const a = (i % 8) / Math.min(8, g.length) * Math.PI * 2;
          lat += r * Math.sin(a);
          lng += (r * Math.cos(a)) / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
        }
        features.push({
          type: 'Feature',
          id: l.id,
          properties: { id: l.id, kind: l.kind, approx: l.location.precision === 'approximate' },
          geometry: { type: 'Point', coordinates: [lng, lat] },
        });
      });
    }
    return { type: 'FeatureCollection', features };
  };

  await new Promise<void>((res) => map.on('load', () => res()));

  map.addSource('listings', { type: 'geojson', data: toGeo(initial), cluster: true, clusterRadius: 44, clusterMaxZoom: 12 });
  // Invisible layer so querySourceFeatures has something to read; markers are HTML for full styling control.
  map.addLayer({ id: 'listings-hit', type: 'circle', source: 'listings', paint: { 'circle-radius': 0, 'circle-opacity': 0 } });

  // ---- HTML markers (clusters + single listings) ----
  const markers = new Map<string, maplibregl.Marker>();
  let onScreen = new Map<string, maplibregl.Marker>();
  let active: string | null = null;
  let hover: string | null = null;

  type SrcFeature = ReturnType<typeof map.querySourceFeatures>[number];
  function makeEl(f: SrcFeature): HTMLElement {
    const p = f.properties as Record<string, unknown>;
    const btn = document.createElement('button');
    btn.type = 'button';
    if (p.cluster) {
      const n = Number(p.point_count);
      btn.className = 'wm wm--cluster';
      btn.style.setProperty('--s', String(Math.min(60, 28 + Math.sqrt(n) * 6)));
      btn.innerHTML = `<span>${n}</span>`;
      btn.setAttribute('aria-label', `${n} listings here. Zoom in`);
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const src = map.getSource('listings') as GeoJSONSource;
        const z = await src.getClusterExpansionZoom(Number(p.cluster_id));
        map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: Math.min(z + 0.3, 16), duration: reduce ? 0 : 700 });
      });
    } else {
      btn.className = `wm wm--${p.kind}${p.approx ? ' wm--approx' : ''}`;
      btn.dataset.id = String(p.id);
      btn.setAttribute('aria-label', `Show listing ${p.id}`);
      btn.innerHTML = '<i></i>';
      btn.addEventListener('click', (e) => { e.stopPropagation(); cb.onSelect(String(p.id)); });
    }
    return btn;
  }

  function renderMarkers() {
    const next = new Map<string, maplibregl.Marker>();
    for (const f of map.querySourceFeatures('listings')) {
      const p = f.properties as Record<string, unknown>;
      const key = p.cluster ? `c${p.cluster_id}` : String(p.id);
      if (next.has(key)) continue;
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

  function paintStates() {
    for (const [k, m] of onScreen) {
      const e = m.getElement();
      e.classList.toggle('is-active', k === active);
      e.classList.toggle('is-hover', k === hover);
    }
  }

  let raf = 0;
  // Throttle (not debounce): during continuous animation a debounce would never fire.
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; renderMarkers(); }); };
  map.on('render', () => { if (map.isSourceLoaded('listings')) schedule(); });
  map.on('moveend', () => cb.onMove());

  // Slow idle spin on the globe until the visitor touches the map.
  let spinning = !reduce;
  const spin = () => {
    if (!spinning || map.getZoom() > 2.5) return;
    const c = map.getCenter();
    map.easeTo({ center: [c.lng + 4, c.lat], duration: 1000, easing: (t) => t });
  };
  map.on('moveend', () => spinning && spin());
  const stop = () => { spinning = false; };
  ['mousedown', 'touchstart', 'wheel', 'dragstart'].forEach((ev) => map.on(ev as 'mousedown', stop));
  spin();

  return {
    setData(ls) { (map.getSource('listings') as GeoJSONSource).setData(toGeo(ls)); for (const m of onScreen.values()) m.remove(); onScreen.clear(); markers.clear(); },
    flyToCity(lat, lng) { stop(); map.flyTo({ center: [lng, lat], zoom: 10.2, speed: 1.1, curve: 1.6, essential: true, ...(reduce ? { duration: 0 } : {}) }); },
    flyToListing(l) { stop(); map.flyTo({ center: [l.location.lng, l.location.lat], zoom: Math.max(map.getZoom(), l.location.precision === 'approximate' ? 11 : 12.5), duration: reduce ? 0 : 900 }); },
    setActive(id) { active = id; paintStates(); },
    setHover(id) { hover = id; paintStates(); },
    getBounds: () => map.getBounds(),
    getZoom: () => map.getZoom(),
    resize: () => map.resize(),
  };
}
