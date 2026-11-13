/**
 * The Earth in the homepage World card: the same picture as the hero globe and World (Blue Marble by day,
 * city lights by night, lit by where the sun really is), drawn large so the card shows its top like a horizon.
 * A small plain three.js scene; loaded only when the card comes on screen and WebGL is available.
 */
import * as THREE from 'three';
import { sunAt } from '@/lib/sun';

/** The sun's direction in the Earth's own frame, matching three.js sphere UVs (lng 0 at +x, lng 90 at -z). */
function sunVector(): THREE.Vector3 {
  const [lng, lat] = sunAt(new Date());
  const r = Math.PI / 180;
  return new THREE.Vector3(Math.cos(lat * r) * Math.cos(lng * r), Math.sin(lat * r), -Math.cos(lat * r) * Math.sin(lng * r));
}

const EARTH_VERT = `
varying vec3 vObj;
varying vec2 vUv;
void main() {
  vObj = normalize(position);
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** Same colours as the hero globe's shader: navy dark with warm lights, soft twilight band. */
const EARTH_FRAG = `
uniform sampler2D dayTexture;
uniform sampler2D nightTexture;
uniform vec3 sun;
varying vec3 vObj;
varying vec2 vUv;
void main() {
  float light = dot(vObj, normalize(sun));
  vec3 dayColor = texture2D(dayTexture, vUv).rgb * (0.82 + 0.28 * clamp(light, 0.0, 1.0));
  vec3 n = texture2D(nightTexture, vUv).rgb;
  float lum = dot(n, vec3(0.299, 0.587, 0.114));
  vec3 nightColor = n * 0.5 + smoothstep(0.28, 0.85, lum) * vec3(1.0, 0.84, 0.55) * 0.95;
  gl_FragColor = vec4(mix(nightColor, dayColor, smoothstep(-0.12, 0.16, light)), 1.0);
  #include <colorspace_fragment>
}`;

/** A thin blue rim of atmosphere, brightest at the edge. */
const AIR_VERT = `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const AIR_FRAG = `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float rim = 1.0 - abs(dot(vNormal, vView));
  float a = pow(rim, 3.2) * 0.95;
  gl_FragColor = vec4(vec3(0.66, 0.78, 1.0) * a, a);
}`;

/** clearOf: the card's words; the horizon always sits a little below them. */
export async function mountCardGlobe(host: HTMLElement, clearOf?: HTMLElement | null): Promise<() => void> {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  host.appendChild(renderer.domElement);

  const loader = new THREE.TextureLoader();
  const tex = (url: string) => new Promise<THREE.Texture>((res, rej) => loader.load(url, (t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); res(t);
  }, undefined, rej));
  // The same files the hero globe loads, so they usually come from the cache.
  const size = host.clientWidth * Math.min(devicePixelRatio, 2) > 1400 ? 4096 : 2048;
  const [day, night] = await Promise.all([tex(`/images/earth/blue-marble-${size}.webp`), tex(`/images/earth/night-${size}.webp`)]);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(20, 1, 0.1, 100);
  camera.position.set(0, 0, 10);

  const uniforms = { dayTexture: { value: day }, nightTexture: { value: night }, sun: { value: sunVector() } };
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), new THREE.ShaderMaterial({ uniforms, vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG }));
  const air = new THREE.Mesh(new THREE.SphereGeometry(1.035, 96, 64), new THREE.ShaderMaterial({
    vertexShader: AIR_VERT, fragmentShader: AIR_FRAG, transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false,
  }));
  // Tip the north pole away from the viewer: the horizon at the top of the card is then about 40° N,
  // so the band the card shows is where most people live.
  const tilt = new THREE.Group();
  tilt.rotation.x = THREE.MathUtils.degToRad(-50);
  tilt.add(earth);
  scene.add(tilt, air);
  // Start with the western Atlantic facing us (longitude -50): North America and Europe share the view.
  earth.rotation.y = THREE.MathUtils.degToRad(-90 + 50);

  // The sphere is wider than the card and sits low, so only its top shows, like a horizon.
  function fit() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Globe diameter on screen ≈ 1.5 × card width; centre well below the card.
    const radiusPx = (w * 1.5) / 2;
    // A sphere of radius 1 at distance d looks 1/sqrt(d²-1) wide (in tan units); solve d for the size we want.
    const k = (radiusPx * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / (h / 2);
    camera.position.set(0, 0, Math.sqrt(1 + 1 / (k * k)));
    // Shift the view so the top of the sphere sits at ~38% of the card's height.
    const below = clearOf ? clearOf.getBoundingClientRect().bottom - host.getBoundingClientRect().top + Math.max(56, h * 0.12) : 0;
    const topPx = Math.max(h * (h > w ? 0.5 : 0.46), below);
    // + the atmosphere, which reaches 3.5% above the surface.
    const offsetPx = radiusPx * 1.035 - (h / 2 - topPx);
    camera.setViewOffset(w, h, 0, -offsetPx, w, h);
    camera.updateProjectionMatrix();
  }
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(host);
  if (clearOf) ro.observe(clearOf);
  // The words settle in (fonts, reveal motion) after the first measure: measure again once they have.
  setTimeout(fit, 1600);
  document.fonts?.ready.then(fit);

  let raf = 0, running = false, last = performance.now();
  const frame = (t: number) => {
    const dt = Math.min(64, t - last); last = t;
    if (!reduce) earth.rotation.y += dt * 0.000025;
    renderer.render(scene, camera);
    if (running) raf = requestAnimationFrame(frame);
  };
  // Only draw while the card is on screen.
  const io = new IntersectionObserver(([e]) => {
    if (e?.isIntersecting && !running) { fit(); running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
    else if (!e?.isIntersecting) { running = false; cancelAnimationFrame(raf); }
  });
  io.observe(host);
  renderer.render(scene, camera);
  const sunTimer = setInterval(() => uniforms.sun.value.copy(sunVector()), 60_000);
  host.classList.add('is-ready');

  return () => { clearInterval(sunTimer); io.disconnect(); ro.disconnect(); cancelAnimationFrame(raf); renderer.dispose(); };
}
