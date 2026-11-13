/**
 * Homepage globe (globe.gl / three.js). Loaded only when the hero is on screen
 * and the browser supports WebGL. Markers are city-level aggregates of listings.
 */
import { sunAt } from '@/lib/sun';

export interface CityPoint { city: string; country: string; lat: number; lng: number; count: number }
/** Where the homepage camera stopped, handed to World so its map opens at the same view. */
export interface Handoff {
  lat: number; lng: number; altitude: number; fov: number;
  /** The camera's frame on screen: the Earth is centred in it and sized to its height. */
  w: number; h: number; top: number; left: number;
  /** Where the last frame's picture covered the screen (the canvas), if not the frame itself. */
  img?: { w: number; h: number; top: number; left: number };
  at: number; image?: string;
}

export async function mountHeroGlobe(el: HTMLElement, points: CityPoint[], opts: { onSelect: (p: CityPoint) => void }) {
  const [{ default: Globe }, THREE] = await Promise.all([import('globe.gl'), import('three')]);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  type Ring = { lat: number; lng: number; me?: boolean };
  const cityRings: Ring[] = points.filter((p) => p.count >= 5);

  // A photographed-from-space Earth, in layers (sources and licences in public/images/earth/SOURCES.md):
  // NASA Blue Marble surface, a separate cloud shell, NASA Black Marble city lights on the night side,
  // a water mask for sun glint on the oceans, an elevation map for relief, and a thin sunlit atmosphere.
  // Phones start with 2K textures, desktops with 4K; big, sharp screens move up to the 8K surface once idle.
  const phone = matchMedia('(max-width: 760px)').matches || Math.max(screen.width, screen.height) < 900;
  const dpr = devicePixelRatio || 1;
  const size = phone ? 2048 : 4096;
  const loader = new THREE.TextureLoader();
  let aniso = 4;
  const tex = (url: string, color = true) => new Promise<InstanceType<typeof THREE.Texture>>((res, rej) => loader.load(url, (t) => {
    t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = aniso;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    res(t);
  }, undefined, rej));
  const E = '/images/earth';
  const [day, night, clouds, water, height] = await Promise.all([
    tex(`${E}/earth-day-${size}.webp`), tex(`${E}/earth-night-${size}.webp`), tex(`${E}/earth-clouds-${size}.webp`, false),
    tex(`${E}/earth-water-4096.webp`, false), tex(`${E}/topology-2048.webp`, false),
  ]);
  /** A direction from latitude and longitude, on the same axes as three-globe's own coordinates. */
  const polar = (lat: number, lng: number) => {
    const phi = ((90 - lat) * Math.PI) / 180, theta = ((90 - lng) * Math.PI) / 180;
    return new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
  };
  const sunDir = new THREE.Vector3();
  const setSun = () => { const [lng, lat] = sunAt(new Date()); sunDir.copy(polar(lat, lng)); };
  setSun();
  const earth = new THREE.ShaderMaterial({
    uniforms: {
      dayMap: { value: day }, nightMap: { value: night }, cloudMap: { value: clouds }, waterMap: { value: water }, heightMap: { value: height },
      heightTexel: { value: new THREE.Vector2(1 / 2048, 1 / 1024) },
      sunDir: { value: sunDir },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
  const globe = new Globe(el, { animateIn: !reduce, waitForGlobeReady: true })
    .backgroundColor('rgba(0,0,0,0)')
    .globeMaterial(earth)
    .showGlobe(true)
    .showGraticules(false)
    // The atmosphere is drawn below as a sunlit shell, so the built-in, evenly lit halo is off.
    // No country lines either: a photograph from space has none.
    .showAtmosphere(false)
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

  // Layers above the surface: clouds just over the ground, then the thin atmosphere.
  const R = globe.getGlobeRadius();
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: { cloudMap: { value: clouds }, sunDir: { value: sunDir } },
    vertexShader: VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false,
  });
  const cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(R * 1.004, 128, 96), cloudMat);
  const airMat = new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: sunDir }, R: { value: R }, Ra: { value: R * 1.032 } },
    vertexShader: VERT, fragmentShader: AIR_FRAG, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const airMesh = new THREE.Mesh(new THREE.SphereGeometry(R * 1.032, 128, 96), airMat);
  // three-globe turns its sphere so the map lines up with its coordinates; the shells take the same turn.
  const surface = globe.scene().getObjectByProperty('material', earth);
  if (surface) { cloudMesh.rotation.copy(surface.rotation); airMesh.rotation.copy(surface.rotation); }
  globe.scene().add(cloudMesh, airMesh);
  // Sharp filtering at grazing angles near the edge of the planet.
  aniso = Math.min(8, globe.renderer().capabilities.getMaxAnisotropy());
  for (const t of [day, night, clouds, water]) { t.anisotropy = aniso; t.needsUpdate = true; }

  // Sharper imagery when it can show: the 8K surface on big, dense screens (once the page settles),
  // and 4K layers on phones when they dive in.
  const want8k = !phone && Math.max(screen.width, screen.height) * dpr >= 2400 && globe.renderer().capabilities.maxTextureSize >= 8192;
  let sharp = !phone && !want8k;
  const upgrade8k = () => tex(`${E}/earth-day-8192.webp`).then((d) => { earth.uniforms.dayMap!.value = d; day.dispose(); }).catch(() => { /* keep 4K */ });
  const sharpen = () => {
    if (sharp) return;
    sharp = true;
    if (want8k) { upgrade8k(); return; }
    Promise.all([tex(`${E}/earth-day-4096.webp`), tex(`${E}/earth-night-4096.webp`), tex(`${E}/earth-clouds-4096.webp`, false)])
      .then(([d, n, c]) => {
        earth.uniforms.dayMap!.value = d; earth.uniforms.nightMap!.value = n; earth.uniforms.cloudMap!.value = c; cloudMat.uniforms.cloudMap!.value = c;
      })
      .catch(() => { /* keep the lighter textures */ });
  };
  if (want8k) {
    const idle = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    if (idle) idle(sharpen, { timeout: 4000 }); else setTimeout(sharpen, 2500);
  }
  /** Close up, the member dots and rings would be blobs: the World map shows them properly instead. */
  const quiet = (on: boolean) => { globe.pointsData(on ? [] : points); globe.ringsData(on ? [] : cityRings); };

  // The sun keeps moving while the page is open.
  setInterval(setSun, 60_000);

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
    const r = Math.min(h * 0.53, w * 0.47);
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
   * Leaving the homepage, the Earth must not stay inside its box (which ends at the hero's edges), or the
   * planet gets cut off by straight lines as the camera comes in. So the globe's element becomes a fixed,
   * full-viewport layer, and the camera's projection is shifted (setViewOffset) so the Earth is drawn exactly
   * where it was in the box: nothing jumps. That framing then glides to the centre of the screen while the
   * camera approaches, using the same duration and easing as globe.gl's own camera move.
   */
  const cam = globe.camera() as InstanceType<typeof THREE.PerspectiveCamera>;
  type Rect = { x: number; y: number; w: number; h: number };
  let view: { from: Rect; to: Rect; t0: number; dur: number } | null = null;
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2); // Cubic.InOut, as globe.gl
  const scene = globe.scene();
  scene.onBeforeRender = () => {
    if (!view) return;
    const t = view.dur ? Math.min(1, (performance.now() - view.t0) / view.dur) : 1;
    const e = ease(t), { from: a, to: b } = view;
    const f = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, w: a.w + (b.w - a.w) * e, h: a.h + (b.h - a.h) * e };
    const vw = el.clientWidth || 1, vh = el.clientHeight || 1;
    // The full camera frame is f (in viewport pixels); the canvas shows the viewport's part of it.
    cam.aspect = f.w / f.h;
    cam.setViewOffset(f.w, f.h, -f.x, -f.y, vw, vh);
  };
  let full = false;
  /** Lift the globe out of its box into a full-viewport layer, then glide to a centred view over dur ms. Returns the old box. */
  const unbox = (dur: number): Rect => {
    const r = el.getBoundingClientRect();
    const box = { x: r.left, y: r.top, w: r.width, h: r.height };
    if (full) return box;
    full = true;
    el.classList.add('is-full');
    const vw = el.clientWidth, vh = el.clientHeight;
    globe.renderer().setSize(vw, vh); // now, so the next frame is already full size
    globe.width(vw).height(vh);
    // Same scale as the box (no shrink before the camera moves in), centred on the screen.
    view = { from: box, to: { x: (vw - box.w) / 2, y: (vh - box.h) / 2, w: box.w, h: box.h }, t0: performance.now(), dur };
    return box;
  };
  /** Back into the box (returning to the page with the back button). */
  const rebox = () => {
    if (!full) return;
    full = false; view = null;
    el.classList.remove('is-full');
    cam.clearViewOffset();
    resize();
  };
  /**
   * The closest the homepage camera comes. Past this point the surface imagery
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
      hold(); unbox(ms(1600));
      globe.pointOfView({ lat, lng, altitude: CLOSEST }, ms(1600));
    },
    /** Move in toward a place (or the current view), as far as the imagery stays sharp. close: centre on the place. */
    dive(lat?: number, lng?: number, close = lat != null) {
      hold(); unbox(ms(1700));
      sharpen();
      const pov = globe.pointOfView();
      globe.pointOfView({ lat: lat ?? pov.lat, lng: lng ?? pov.lng, altitude: close ? CLOSEST : Math.max(CLOSEST, 1.3) }, ms(1700));
    },
    /**
     * Explore World: the camera moves in toward whatever part of the Earth faces the viewer. Resolves with exactly where it stopped, so World can open its map at that same view.
     */
    approach(): Promise<Handoff> {
      const dur = ms(1900);
      hold(); sharpen(); quiet(true);
      unbox(dur);
      const pov = globe.pointOfView();
      const lat = Math.max(-35, Math.min(55, pov.lat));
      // A real approach: the Earth grows past the edges of the screen, stopping just short of the point where its
      // imagery would soften (World takes over from there with the same lit Earth). Never pulls back.
      globe.pointOfView({ lat, lng: pov.lng, altitude: Math.min(pov.altitude, CLOSEST + 0.1) }, dur);
      return new Promise((res) => setTimeout(() => {
        const end = globe.pointOfView();
        // Where the camera's frame ended up on screen: World opens its map with the Earth at this same size and place.
        const f = view?.to ?? { x: el.getBoundingClientRect().left, y: el.getBoundingClientRect().top, w: el.clientWidth, h: el.clientHeight };
        const r = { width: f.w, height: f.h, top: f.y, left: f.x };
        const c = el.getBoundingClientRect();
        res({ lat: end.lat, lng: end.lng, altitude: end.altitude, fov: (globe.camera() as unknown as { fov?: number }).fov ?? 50, w: r.width, h: r.height, top: r.top, left: r.left, img: { w: c.width, h: c.height, top: c.top, left: c.left }, at: Date.now(), image: frame() });
      }, dur + 60));
    },
    /** Fly down to the visitor's own area and mark it. The position stays in the page. */
    here(lat: number, lng: number) {
      hold(); unbox(ms(2200));
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
      rebox();
      quiet(false);
      globe.pointOfView({ ...globe.pointOfView(), altitude: home() }, ms(1200));
      controls.autoRotate = !reduce;
      controls.autoRotateSpeed = 0.35;
      interactive(false);
      resting = true;
    },
  };
}

/** World-space normal, position and texture coordinate, shared by the surface, clouds and atmosphere. */
const VERT = `
varying vec3 vN;
varying vec3 vPos;
varying vec2 vUv;
void main() {
  vUv = uv;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

/** Sunlight colour: warm and low near the terminator, near white when the sun is high. */
const SUN = `
vec3 sunColor(float h) { return mix(vec3(1.0, 0.74, 0.55), vec3(1.0, 0.98, 0.95), smoothstep(0.0, 0.22, h)); }
float cloudAlpha(float c) { return smoothstep(0.1, 0.85, c); }
const vec3 SKY = vec3(0.30, 0.50, 1.0);
`;

/**
 * The surface, lit by the real sun. All maths is in linear light; the output is converted to sRGB at the end.
 * Daylight: Blue Marble colour x sunlight, with relief from the elevation map, soft cloud shadows,
 * a sun glint on water, and blue haze toward the edge of the planet. Night: Black Marble city lights,
 * dimmed under clouds, fading in across a soft twilight band.
 */
const FRAG = `
uniform sampler2D dayMap;
uniform sampler2D nightMap;
uniform sampler2D cloudMap;
uniform sampler2D waterMap;
uniform sampler2D heightMap;
uniform vec2 heightTexel;
uniform vec3 sunDir;
varying vec3 vN;
varying vec3 vPos;
varying vec2 vUv;
${SUN}
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vPos);
  vec3 L = normalize(sunDir);
  float water = texture2D(waterMap, vUv).r;

  // Relief: tilt the normal along the slope of the elevation map (land only).
  vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), N) + vec3(1e-5, 0.0, 0.0));
  vec3 north = cross(N, east);
  float hl = texture2D(heightMap, vUv - vec2(heightTexel.x, 0.0)).r;
  float hr = texture2D(heightMap, vUv + vec2(heightTexel.x, 0.0)).r;
  float hd = texture2D(heightMap, vUv - vec2(0.0, heightTexel.y)).r;
  float hu = texture2D(heightMap, vUv + vec2(0.0, heightTexel.y)).r;
  vec3 Nb = normalize(N - 0.9 * (1.0 - water) * ((hr - hl) * east + (hu - hd) * north));

  float h = dot(N, L);
  float diff = clamp(dot(Nb, L), 0.0, 1.0);
  float dayK = smoothstep(-0.08, 0.1, h);
  vec3 sun = sunColor(h);

  // Cloud shadows land a little away from the sun.
  vec2 toSun = vec2(dot(L, east), dot(L, north));
  float shade = cloudAlpha(texture2D(cloudMap, vUv - toSun * 0.0012).r);
  float overhead = cloudAlpha(texture2D(cloudMap, vUv).r);

  vec3 albedo = texture2D(dayMap, vUv).rgb;
  vec3 col = albedo * sun * diff * 1.4 * (1.0 - 0.4 * shade * dayK);

  // Sun glint: a tight highlight and a broad sheen, on open water only.
  vec3 H = normalize(L + V);
  float nh = max(dot(N, H), 0.0);
  float nv = max(dot(N, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
  float glint = pow(nh, 160.0) * 1.1 + pow(nh, 18.0) * 0.06;
  col += water * (1.0 - overhead) * glint * sun * dayK * (0.4 + fres);

  // Atmosphere seen through: blue haze growing toward the limb on the lit side.
  float rim = pow(1.0 - nv, 2.2);
  col = mix(col, SKY * (0.18 + 0.7 * diff) * sun, rim * 0.6 * smoothstep(-0.2, 0.45, h));
  col += SKY * 0.012 * dayK;

  // Night: city lights and a faint glow of the land, under the clouds.
  vec3 n = texture2D(nightMap, vUv).rgb;
  float lum = dot(n, vec3(0.2126, 0.7152, 0.0722));
  vec3 lights = smoothstep(0.02, 0.5, lum) * vec3(1.0, 0.78, 0.48) * 1.3 * (1.0 - 0.75 * overhead);
  float nightK = 1.0 - smoothstep(-0.16, 0.06, h);
  col += (n * 0.2 + lights) * nightK;

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/** The cloud shell: white where the sun reaches it, warm at the terminator, nearly invisible at night. */
const CLOUD_FRAG = `
uniform sampler2D cloudMap;
uniform vec3 sunDir;
varying vec3 vN;
varying vec3 vPos;
varying vec2 vUv;
${SUN}
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vPos);
  vec3 L = normalize(sunDir);
  float a = cloudAlpha(texture2D(cloudMap, vUv).r);
  float h = dot(N, L);
  float lit = clamp(h * 1.05 + 0.04, 0.0, 1.0);
  vec3 col = vec3(0.96) * sunColor(h) * lit * 1.18;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.2);
  col = mix(col, SKY * lit, rim * 0.35);
  float alpha = a * 0.95 * (0.12 + 0.88 * smoothstep(-0.25, 0.08, h));
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}`;

/**
 * The atmosphere: a thin shell seen edge-on. For each pixel, how close the line of sight passes to the
 * ground sets how much air it crosses; the side facing the sun glows blue, the night side barely at all.
 */
const AIR_FRAG = `
uniform vec3 sunDir;
uniform float R;
uniform float Ra;
varying vec3 vN;
varying vec3 vPos;
varying vec2 vUv;
${SUN}
void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vPos - ro);
  vec3 cp = ro + rd * (-dot(ro, rd));
  float d = length(cp);
  float hgt = clamp((d - R) / (Ra - R), 0.0, 1.0);
  float dens = exp(-hgt * 4.5) * (1.0 - hgt);
  float s = dot(normalize(cp), normalize(sunDir));
  float sunK = smoothstep(-0.3, 0.45, s);
  vec3 col = mix(SKY, vec3(0.55, 0.72, 1.0), 0.25) * dens * (0.05 + 0.95 * sunK) * 1.15;
  float a = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;
