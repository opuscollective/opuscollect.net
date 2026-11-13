/**
 * Homepage globe (globe.gl / three.js). Loaded only when the hero is on screen
 * and the browser supports WebGL. Markers are city-level aggregates of listings.
 */
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';

export interface CityPoint { city: string; country: string; lat: number; lng: number; count: number }

export async function mountHeroGlobe(el: HTMLElement, points: CityPoint[], opts: { onSelect: (p: CityPoint) => void }) {
  const [{ default: Globe }, topo] = await Promise.all([
    import('globe.gl'),
    fetch('/data/countries-110m.json').then((r) => r.json() as Promise<Topology>),
  ]);
  const countries = feature(topo, topo.objects.countries as GeometryCollection).features;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  type Ring = { lat: number; lng: number; me?: boolean };
  const cityRings: Ring[] = points.filter((p) => p.count >= 5);

  // The real Earth (NASA Blue Marble, public domain): the one full-colour object on the page.
  // Big screens get the sharper texture; phones the lighter one.
  const big = Math.max(screen.width, screen.height) * (devicePixelRatio || 1) > 1800 && !matchMedia('(max-width: 760px)').matches;
  const globe = new Globe(el, { animateIn: !reduce, waitForGlobeReady: true })
    .backgroundColor('rgba(0,0,0,0)')
    .globeImageUrl(big ? '/images/earth/blue-marble-4096.webp' : '/images/earth/blue-marble-2048.webp')
    .bumpImageUrl('/images/earth/topology-2048.webp')
    .showGlobe(true)
    .showGraticules(false)
    .atmosphereColor('#6fa8ff')
    .atmosphereAltitude(0.2)
    // Countries: no fill, just a whisper of a border, so the planet reads as itself.
    .polygonsData(countries)
    .polygonAltitude(0.002)
    .polygonCapColor(() => 'rgba(0,0,0,0)')
    .polygonSideColor(() => 'rgba(0,0,0,0)')
    .polygonStrokeColor(() => 'rgba(255,255,255,0.08)')
    // City markers: icy points sized by listing count
    .pointsData(points)
    .pointLat('lat')
    .pointLng('lng')
    .pointAltitude(0.006)
    .pointRadius((d: object) => 0.22 + Math.min(0.38, Math.sqrt((d as CityPoint).count) * 0.08))
    .pointColor(() => '#ffffff')
    .pointsMerge(false)
    .pointLabel((d: object) => {
      const p = d as CityPoint;
      return `<div class="gl-tip"><b>${p.city}</b><span>${p.count} sample listing${p.count === 1 ? '' : 's'}</span></div>`;
    })
    .onPointClick((d: object) => opts.onSelect(d as CityPoint))
    // Soft rings around active cities; a brighter, tighter pulse marks "you are here" once the visitor shares it.
    .ringsData(cityRings)
    .ringLat('lat')
    .ringLng('lng')
    .ringColor((d: object) => ((d as Ring).me ? (t: number) => `rgba(236, 242, 250,${0.9 * (1 - t)})` : (t: number) => `rgba(255, 255, 255,${0.4 * (1 - t)})`))
    .ringMaxRadius((d: object) => ((d as Ring).me ? 1.6 : 3))
    .ringPropagationSpeed((d: object) => ((d as Ring).me ? 0.9 : 0.8))
    .ringRepeatPeriod((d: object) => ((d as Ring).me ? 1200 : 2200));

  // A little sheen on the oceans and relief on the land; the texture carries the colour.
  const mat = globe.globeMaterial() as unknown as { bumpScale: number; shininess: number; specular?: { set(c: string): void } };
  mat.bumpScale = 6;
  mat.shininess = 14;
  mat.specular?.set('#2a3a55');

  const controls = globe.controls();
  controls.autoRotate = !reduce;
  controls.autoRotateSpeed = 0.35;
  controls.enableDamping = true;
  controls.minDistance = 125; // about altitude 0.25: close enough to see a metro area
  controls.maxDistance = 520;
  // The globe fills the hero behind the headline. Pull the camera back on tall, narrow screens so the sphere fits the width.
  const home = () => {
    const w = el.clientWidth, h = el.clientHeight || 1;
    return w / h < 0.8 ? 2.5 : w / h < 1.2 ? 2.2 : 1.6;
  };
  globe.pointOfView({ lat: 28, lng: -40, altitude: home() }, 0);

  // At rest the globe is scenery: it spins on its own and ignores the mouse, wheel and touch, so scrolling
  // the homepage never grabs it. It becomes interactive only inside World (after dive()).
  const canvas = globe.renderer().domElement;
  // Input is blocked with pointer-events rather than controls.enabled: the renderer only runs the controls'
  // update (which keeps the camera aimed at the globe and drives auto-rotation) while they are enabled.
  const interactive = (on: boolean) => {
    el.style.pointerEvents = on ? 'auto' : 'none';
    canvas.style.touchAction = on ? 'none' : 'auto';
  };
  interactive(false);

  const resize = () => globe.width(el.clientWidth).height(el.clientHeight);
  resize();
  new ResizeObserver(resize).observe(el);

  // Pause rendering when the hero is off screen to save battery.
  new IntersectionObserver(([e]) => (e?.isIntersecting ? globe.resumeAnimation() : globe.pauseAnimation())).observe(el);


  const ms = (n: number) => (reduce ? 0 : n);
  /** Stop turning: auto-rotation off and no leftover spin from damping, so the camera lands where it's sent. */
  const hold = () => {
    controls.autoRotate = false;
    const c = controls as unknown as { _sphericalDelta?: { set(a: number, b: number, c: number): void }; sphericalDelta?: { set(a: number, b: number, c: number): void } };
    (c._sphericalDelta ?? c.sphericalDelta)?.set(0, 0, 0);
  };
  return {
    flyTo(lat: number, lng: number) {
      hold();
      globe.pointOfView({ lat, lng, altitude: 0.9 }, ms(1600));
    },
    /** Move in toward a place (or the current view) for the directory panel. close: right down to city level. */
    dive(lat?: number, lng?: number, close = lat != null) {
      hold();
      interactive(true);
      const pov = globe.pointOfView();
      globe.pointOfView({ lat: lat ?? pov.lat, lng: lng ?? pov.lng, altitude: close ? 0.42 : 0.9 }, ms(1700));
    },
    /** Fly down to the visitor's own area and mark it. The position stays in the page. */
    here(lat: number, lng: number) {
      hold();
      interactive(true);
      globe.ringsData([...cityRings, { lat, lng, me: true }]);
      globe.pointOfView({ lat, lng, altitude: 0.3 }, ms(2200));
    },
    /** No location: pull back a little and let the whole world turn. */
    spin() {
      interactive(false);
      globe.pointOfView({ ...globe.pointOfView(), altitude: Math.max(1.4, home() * 0.75) }, ms(1400));
      controls.autoRotate = !reduce;
      controls.autoRotateSpeed = 1.1;
    },
    /** Back out to the resting view. */
    rise() {
      globe.pointOfView({ ...globe.pointOfView(), altitude: home() }, ms(1200));
      controls.autoRotate = !reduce;
      controls.autoRotateSpeed = 0.35;
      interactive(false);
    },
  };
}
