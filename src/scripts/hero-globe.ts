/**
 * Homepage globe (globe.gl / three.js). Loaded only when the hero is on screen
 * and the browser supports WebGL. Markers are city-level aggregates of listings.
 */
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { sunAt } from '@/lib/sun';

export interface CityPoint { city: string; country: string; lat: number; lng: number; count: number }
/** Where the homepage camera stopped, handed to World so its map opens at the same view. */
export interface Handoff { lat: number; lng: number; altitude: number; fov: number; w: number; h: number; top: number; left: number; at: number; image?: string }

export async function mountHeroGlobe(el: HTMLElement, points: CityPoint[], opts: { onSelect: (p: CityPoint) => void }) {
  const [{ default: Globe }, THREE, topo] = await Promise.all([
    import('globe.gl'),
    import('three'),
    fetch('/data/countries-110m.json').then((r) => r.json() as Promise<Topology>),
  ]);
  const countries = feature(topo, topo.objects.countries as GeometryCollection).features;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  type Ring = { lat: number; lng: number; me?: boolean };
  const cityRings: Ring[] = points.filter((p) => p.count >= 5);

  // The real Earth (NASA imagery, public domain), lit by the real sun right now: daylight on one side,
  // city lights on the other, like looking at it from space. Big screens get sharper textures.
  const big = Math.max(screen.width, screen.height) * (devicePixelRatio || 1) > 1800 && !matchMedia('(max-width: 760px)').matches;
  const size = big ? 4096 : 2048;
  const loader = new THREE.TextureLoader();
  const tex = (url: string) => new Promise<InstanceType<typeof THREE.Texture>>((res, rej) => loader.load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; res(t); }, undefined, rej));
  const [day, night] = await Promise.all([tex(`/images/earth/blue-marble-${size}.webp`), tex(`/images/earth/night-${size}.webp`)]);
  const earth = new THREE.ShaderMaterial({
    uniforms: {
      dayTexture: { value: day },
      nightTexture: { value: night },
      sunPosition: { value: new THREE.Vector2(...sunAt(new Date())) },
      globeRotation: { value: new THREE.Vector2() },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
  const globe = new Globe(el, { animateIn: !reduce, waitForGlobeReady: true })
    .backgroundColor('rgba(0,0,0,0)')
    .globeMaterial(earth)
    .showGlobe(true)
    .showGraticules(false)
    .atmosphereColor('#a9c8ff')
    .atmosphereAltitude(0.13)
    .onZoom(({ lng, lat }) => earth.uniforms.globeRotation!.value.set(lng, lat))
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

  // Diving in: swap to the sharp textures once, so the close-up isn't blurry (phones start light).
  let sharp = big;
  const sharpen = () => {
    if (sharp) return;
    sharp = true;
    Promise.all([tex('/images/earth/blue-marble-4096.webp'), tex('/images/earth/night-4096.webp')])
      .then(([d, n]) => { earth.uniforms.dayTexture!.value = d; earth.uniforms.nightTexture!.value = n; })
      .catch(() => { /* keep the lighter textures */ });
  };
  /** Close up, the member dots and rings would be blobs: the World map shows them properly instead. */
  const quiet = (on: boolean) => { globe.pointsData(on ? [] : points); globe.ringsData(on ? [] : cityRings); };

  // The sun keeps moving while the page is open.
  setInterval(() => earth.uniforms.sunPosition!.value.set(...sunAt(new Date())), 60_000);

  // Continents and oceans named the way a map from space does: spaced capitals for land, italics for water.
  type Label = { lat: number; lng: number; text: string; kind: 'land' | 'sea' | 'me' };
  const LABELS: Label[] = [
    { lat: 46, lng: -102, text: 'North America', kind: 'land' }, { lat: -14, lng: -60, text: 'South America', kind: 'land' },
    { lat: 52, lng: 18, text: 'Europe', kind: 'land' }, { lat: 6, lng: 21, text: 'Africa', kind: 'land' },
    { lat: 47, lng: 92, text: 'Asia', kind: 'land' }, { lat: -24, lng: 134, text: 'Australia', kind: 'land' },
    { lat: 32, lng: -42, text: 'North Atlantic Ocean', kind: 'sea' }, { lat: -24, lng: -16, text: 'South Atlantic Ocean', kind: 'sea' },
    { lat: 28, lng: -150, text: 'North Pacific Ocean', kind: 'sea' }, { lat: -28, lng: -118, text: 'South Pacific Ocean', kind: 'sea' },
    { lat: -22, lng: 78, text: 'Indian Ocean', kind: 'sea' },
  ];
  const labelEl = (d: object) => {
    const l = d as Label;
    const e = document.createElement('div');
    e.className = `gl-label gl-label--${l.kind}`;
    // You are here, the Opus way: the OC mark sending out sound waves.
    if (l.kind === 'me') e.innerHTML = '<b></b><b></b><b></b><span><img src="/images/oc-logo.png" alt="" /></span>';
    else e.textContent = l.text;
    e.setAttribute('aria-hidden', 'true');
    return e;
  };
  globe.htmlElementsData(LABELS).htmlElement(labelEl).htmlAltitude(0.01)
    .htmlElementVisibilityModifier((e, visible) => { e.style.opacity = visible ? '' : '0'; });

  const controls = globe.controls();
  controls.autoRotate = !reduce;
  controls.autoRotateSpeed = 0.35;
  controls.enableDamping = true;
  controls.minDistance = 125; // about altitude 0.25: close enough to see a metro area
  controls.maxDistance = 520;
  // The globe sits in its own box beside the words: as large as the box's height allows, but never wider than
  // the box, so it can be cropped by the screen edge without ever reaching into the text column.
  const home = () => {
    const w = el.clientWidth || 1, h = el.clientHeight || 1;
    const fov = (globe.camera() as unknown as { fov?: number }).fov ?? 50;
    const r = Math.min(h * 0.46, w * 0.47);
    const k = h / 2 / Math.tan((fov * Math.PI) / 360) / r;
    return Math.sqrt(k * k + 1) - 1;
  };
  globe.pointOfView({ lat: 28, lng: -40, altitude: home() }, 0);

  // At rest the globe is scenery: it spins on its own and ignores the mouse, wheel and touch, so scrolling
  // the homepage never grabs it. Turning and zooming happen in World.
  const canvas = globe.renderer().domElement;
  // Input is blocked with pointer-events rather than controls.enabled: the renderer only runs the controls'
  // update (which keeps the camera aimed at the globe and drives auto-rotation) while they are enabled.
  const interactive = (on: boolean) => {
    el.style.pointerEvents = on ? 'auto' : 'none';
    canvas.style.touchAction = on ? 'none' : 'auto';
  };
  interactive(false);

  // At rest, a new window size gets a new framing; once the camera is moving somewhere, it's left alone.
  let resting = true;
  const resize = () => {
    globe.width(el.clientWidth).height(el.clientHeight);
    if (resting) globe.pointOfView({ ...globe.pointOfView(), altitude: home() }, 0);
  };
  resize();
  new ResizeObserver(resize).observe(el);

  // Pause rendering when the hero is off screen to save battery.
  new IntersectionObserver(([e]) => (e?.isIntersecting ? globe.resumeAnimation() : globe.pauseAnimation())).observe(el);


  const ms = (n: number) => (reduce ? 0 : n);
  /** Stop turning: auto-rotation off and no leftover spin from damping, so the camera lands where it's sent. */
  const hold = () => {
    resting = false;
    controls.autoRotate = false;
    const c = controls as unknown as { _sphericalDelta?: { set(a: number, b: number, c: number): void }; sphericalDelta?: { set(a: number, b: number, c: number): void } };
    (c._sphericalDelta ?? c.sphericalDelta)?.set(0, 0, 0);
  };
  /**
   * The closest the homepage camera comes. The imagery is 4096 px around the Earth, so past this point it
   * would soften. World takes over from here at the same framing (zoom ~2.9) and its street map stays sharp.
   */
  const CLOSEST = 0.9;
  /** The last frame as a small JPEG on the page's background, so World can show it until its own map has drawn. */
  const frame = (): string | undefined => {
    try {
      const gl = globe.renderer();
      gl.render(globe.scene(), globe.camera());
      const src = gl.domElement;
      const k = Math.min(1, 1600 / src.width);
      const c = document.createElement('canvas');
      c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
      const g = c.getContext('2d');
      if (!g) return undefined;
      g.fillStyle = getComputedStyle(el.closest('section') ?? document.body).backgroundColor || '#111';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(src, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.86);
    } catch { return undefined; }
  };
  return {
    flyTo(lat: number, lng: number) {
      hold();
      globe.pointOfView({ lat, lng, altitude: CLOSEST }, ms(1600));
    },
    /** Move in toward a place (or the current view), as far as the imagery stays sharp. close: centre on the place. */
    dive(lat?: number, lng?: number, close = lat != null) {
      hold();
      sharpen();
      const pov = globe.pointOfView();
      globe.pointOfView({ lat: lat ?? pov.lat, lng: lng ?? pov.lng, altitude: close ? CLOSEST : Math.max(CLOSEST, 1.3) }, ms(1700));
    },
    /**
     * Explore World: the camera moves in toward whatever part of the Earth faces the viewer. Resolves with exactly where it stopped, so World can open its map at that same view.
     */
    approach(): Promise<Handoff> {
      hold(); sharpen(); quiet(true);
      const pov = globe.pointOfView();
      const lat = Math.max(-35, Math.min(55, pov.lat));
      const dur = ms(1900);
      // Close enough to feel like arriving, still inside the range where World shows the same lit Earth.
      // The globe's box ends where the words begin, so the sphere may not grow wider than the box.
      const fov = (globe.camera() as unknown as { fov?: number }).fov ?? 50;
      const k = el.clientHeight / 2 / Math.tan((fov * Math.PI) / 360) / (el.clientWidth * 0.495);
      const fits = Math.sqrt(k * k + 1) - 1;
      globe.pointOfView({ lat, lng: pov.lng, altitude: Math.min(pov.altitude, Math.max(1.15, fits)) }, dur);
      return new Promise((res) => setTimeout(() => {
        const end = globe.pointOfView();
        const r = el.getBoundingClientRect();
        res({ lat: end.lat, lng: end.lng, altitude: end.altitude, fov: (globe.camera() as unknown as { fov?: number }).fov ?? 50, w: r.width, h: r.height, top: r.top, left: r.left, at: Date.now(), image: frame() });
      }, dur + 60));
    },
    /** Fly down to the visitor's own area and mark it. The position stays in the page. */
    here(lat: number, lng: number) {
      hold();
      sharpen(); quiet(true);
      globe.htmlElementsData([...LABELS, { lat, lng, text: '', kind: 'me' }]);
      globe.pointOfView({ lat, lng, altitude: CLOSEST }, ms(2200));
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
      quiet(false);
      globe.pointOfView({ ...globe.pointOfView(), altitude: home() }, ms(1200));
      controls.autoRotate = !reduce;
      controls.autoRotateSpeed = 0.35;
      interactive(false);
      resting = true;
    },
  };
}

const VERT = `
varying vec3 vNormal;
varying vec2 vUv;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** Day texture where the sun is up, night lights where it isn't, with a soft twilight band between. */
const FRAG = `
#define PI 3.141592653589793
uniform sampler2D dayTexture;
uniform sampler2D nightTexture;
uniform vec2 sunPosition;
uniform vec2 globeRotation;
varying vec3 vNormal;
varying vec2 vUv;
float toRad(in float a) { return a * PI / 180.0; }
vec3 polarToCartesian(in vec2 c) {
  float theta = toRad(90.0 - c.x);
  float phi = toRad(90.0 - c.y);
  return vec3(sin(phi) * cos(theta), cos(phi), sin(phi) * sin(theta));
}
void main() {
  float invLon = toRad(globeRotation.x);
  float invLat = -toRad(globeRotation.y);
  mat3 rotX = mat3(1, 0, 0, 0, cos(invLat), -sin(invLat), 0, sin(invLat), cos(invLat));
  mat3 rotY = mat3(cos(invLon), 0, sin(invLon), 0, 1, 0, -sin(invLon), 0, cos(invLon));
  vec3 sun = rotX * rotY * polarToCartesian(sunPosition);
  float light = dot(normalize(vNormal), normalize(sun));
  vec3 dayColor = texture2D(dayTexture, vUv).rgb * (0.82 + 0.28 * clamp(light, 0.0, 1.0));
  vec3 n = texture2D(nightTexture, vUv).rgb;
  float lum = dot(n, vec3(0.299, 0.587, 0.114));
  // Deep navy where it's dark, warm city lights where people are.
  vec3 nightColor = n * 0.5 + smoothstep(0.28, 0.85, lum) * vec3(1.0, 0.84, 0.55) * 0.95;
  float blend = smoothstep(-0.12, 0.16, light);
  gl_FragColor = vec4(mix(nightColor, dayColor, blend), 1.0);
  #include <colorspace_fragment>
}`;
