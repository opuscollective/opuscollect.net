/**
 * Daylight on Earth, shared by the homepage globe and World so both show the same day and night.
 * Pure: no DOM.
 */

/** Where the sun is overhead right now, as [lng, lat]. Accurate to well under a degree, plenty for a picture. */
export function sunAt(d: Date): [number, number] {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const dayOfYear = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start) / 864e5;
  const decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));
  const g = ((2 * Math.PI) / 365) * (dayOfYear - 81);
  const eot = 9.87 * Math.sin(2 * g) - 7.53 * Math.cos(g) - 1.5 * Math.sin(g); // minutes
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
  const lng = 180 - (minutes + eot) / 4;
  return [((lng + 540) % 360) - 180, decl];
}

/** Cosine of the sun's angle from overhead at a point: 1 at noon, 0 on the terminator, negative at night. */
export function sunlight(lat: number, lng: number, sun: [number, number]): number {
  const r = Math.PI / 180;
  return Math.sin(lat * r) * Math.sin(sun[1] * r) + Math.cos(lat * r) * Math.cos(sun[1] * r) * Math.cos((lng - sun[0]) * r);
}

const smoothstep = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
/** How much of the day picture shows at a point: the same soft twilight band as the homepage globe's shader. */
export const dayAmount = (light: number) => smoothstep(-0.12, 0.16, light);
