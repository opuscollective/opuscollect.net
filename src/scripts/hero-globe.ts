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

  const globe = new Globe(el, { animateIn: !reduce, waitForGlobeReady: true })
    .backgroundColor('rgba(0,0,0,0)')
    .showGlobe(true)
    .showGraticules(true)
    .atmosphereColor('#9fb6d4')
    .atmosphereAltitude(0.12)
    // Countries: graphite caps, thin gray borders
    .polygonsData(countries)
    .polygonAltitude(0.004)
    .polygonCapColor(() => '#17181c')
    .polygonSideColor(() => 'rgba(0,0,0,0)')
    .polygonStrokeColor(() => 'rgba(210,215,225,0.16)')
    // City markers: icy points sized by listing count
    .pointsData(points)
    .pointLat('lat')
    .pointLng('lng')
    .pointAltitude(0.006)
    .pointRadius((d: object) => 0.22 + Math.min(0.38, Math.sqrt((d as CityPoint).count) * 0.08))
    .pointColor(() => '#d6e4f5')
    .pointsMerge(false)
    .pointLabel((d: object) => {
      const p = d as CityPoint;
      return `<div class="gl-tip"><b>${p.city}</b><span>${p.count} sample listing${p.count === 1 ? '' : 's'}</span></div>`;
    })
    .onPointClick((d: object) => opts.onSelect(d as CityPoint))
    // Soft rings around active cities
    .ringsData(points.filter((p) => p.count >= 5))
    .ringLat('lat')
    .ringLng('lng')
    .ringColor(() => (t: number) => `rgba(169, 199, 236,${0.45 * (1 - t)})`)
    .ringMaxRadius(3)
    .ringPropagationSpeed(0.8)
    .ringRepeatPeriod(2200);

  // Dark graphite sphere: adjust the default Phong material rather than importing three.js directly.
  const mat = globe.globeMaterial() as unknown as { color: { set(c: string): void }; emissive: { set(c: string): void }; shininess: number };
  mat.color.set('#0a0b0d');
  mat.emissive.set('#050608');
  mat.shininess = 4;

  const controls = globe.controls();
  controls.autoRotate = !reduce;
  controls.autoRotateSpeed = 0.35;
  controls.enableDamping = true;
  controls.minDistance = 140;
  controls.maxDistance = 520;
  // The globe fills the hero behind the headline. Pull the camera back on tall, narrow screens so the sphere fits the width.
  const home = () => {
    const w = el.clientWidth, h = el.clientHeight || 1;
    return w / h < 0.8 ? 2.5 : w / h < 1.2 ? 2.2 : 1.6;
  };
  globe.pointOfView({ lat: 28, lng: -40, altitude: home() }, 0);

  // At rest the globe is scenery: it spins on its own and ignores the mouse, wheel and touch, so scrolling
  // the homepage never grabs it. It becomes interactive only inside Opus World (after dive()).
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
    /** Back out to the resting view. */
    rise() {
      globe.pointOfView({ ...globe.pointOfView(), altitude: home() }, ms(1200));
      controls.autoRotate = !reduce;
      interactive(false);
    },
  };
}
