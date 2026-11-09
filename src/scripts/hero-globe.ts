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
  // Phones: the globe sits in its own square, so pull back a little to show the whole sphere.
  const narrow = () => el.clientWidth < 600;
  globe.pointOfView({ lat: 28, lng: -40, altitude: narrow() ? 2.5 : 2.1 }, 0);

  // OrbitControls sets touch-action:none on the canvas, which traps the page scroll on phones.
  // Let the browser keep vertical swipes (page scroll) and pinch; sideways drags still turn the globe.
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch) {
    controls.enableZoom = false;
    globe.renderer().domElement.style.touchAction = 'pan-y';
  }

  const resize = () => globe.width(el.clientWidth).height(el.clientHeight);
  resize();
  new ResizeObserver(resize).observe(el);

  // Pause rendering when the hero is off screen to save battery.
  new IntersectionObserver(([e]) => (e?.isIntersecting ? globe.resumeAnimation() : globe.pauseAnimation())).observe(el);

  // Stop auto-rotation once the user takes control.
  el.addEventListener('pointerdown', () => (controls.autoRotate = false), { once: true });

  return {
    flyTo(lat: number, lng: number) {
      controls.autoRotate = false;
      globe.pointOfView({ lat, lng, altitude: 0.9 }, reduce ? 0 : 1600);
    },
  };
}
