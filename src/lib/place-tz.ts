/**
 * The time zone of a city, worked out from its country, region and public centre point, so nobody picks a zone from a
 * list of cities. Pure and dependency-free. States that straddle two zones are split at an approximate line; a studio
 * near that line can still set its zone by name on the studio profile.
 */
export interface TzPlace { country: string; region?: string | null; lat: number; lng: number }

const ET = 'America/New_York', CT = 'America/Chicago', MT = 'America/Denver', PT = 'America/Los_Angeles';

const US: Record<string, string> = {
  CT: ET, DE: ET, DC: ET, GA: ET, ME: ET, MD: ET, MA: ET, NH: ET, NJ: ET, NY: ET, NC: ET, OH: ET, PA: ET, RI: ET, SC: ET, VT: ET, VA: ET, WV: ET, MI: ET, FL: ET, IN: ET, KY: ET,
  AL: CT, AR: CT, IL: CT, IA: CT, LA: CT, MN: CT, MS: CT, MO: CT, OK: CT, WI: CT, TN: CT, TX: CT, KS: CT, NE: CT, SD: CT, ND: CT,
  CO: MT, MT: MT, NM: MT, UT: MT, WY: MT, ID: MT, AZ: 'America/Phoenix',
  CA: PT, NV: PT, OR: PT, WA: PT, AK: 'America/Anchorage', HI: 'Pacific/Honolulu', PR: 'America/Puerto_Rico',
};
/** States in two zones: the part that differs from the table above. */
const US_SPLIT: Record<string, (p: TzPlace) => string | null> = {
  FL: (p) => (p.lng < -85.1 ? CT : null),
  TN: (p) => (p.lng > -85.4 ? ET : null),
  KY: (p) => (p.lng < -86.0 ? CT : null),
  IN: (p) => ((p.lat > 41 && p.lng < -86.9) || (p.lat < 38.4 && p.lng < -86.7) ? CT : null),
  TX: (p) => (p.lng < -104.9 ? MT : null),
  KS: (p) => (p.lng < -101.5 ? MT : null),
  NE: (p) => (p.lng < -101 ? MT : null),
  SD: (p) => (p.lng < -100.5 ? MT : null),
  ND: (p) => (p.lng < -102 && p.lat < 47.3 ? MT : null),
  ID: (p) => (p.lat > 45.5 ? PT : null),
};
const CA: Record<string, string> = {
  ON: 'America/Toronto', QC: 'America/Toronto', NS: 'America/Halifax', NB: 'America/Halifax', PE: 'America/Halifax', NL: 'America/St_Johns',
  MB: 'America/Winnipeg', SK: 'America/Regina', AB: 'America/Edmonton', BC: 'America/Vancouver',
};
const COUNTRY: Record<string, string> = {
  GB: 'Europe/London', IE: 'Europe/Dublin', FR: 'Europe/Paris', DE: 'Europe/Berlin', NL: 'Europe/Amsterdam', SE: 'Europe/Stockholm', ES: 'Europe/Madrid',
  IT: 'Europe/Rome', PT: 'Europe/Lisbon', BE: 'Europe/Brussels', NG: 'Africa/Lagos', GH: 'Africa/Accra', ZA: 'Africa/Johannesburg', KE: 'Africa/Nairobi',
  KR: 'Asia/Seoul', JP: 'Asia/Tokyo', IN: 'Asia/Kolkata', JM: 'America/Jamaica', CO: 'America/Bogota', MX: 'America/Mexico_City', BR: 'America/Sao_Paulo',
};
const AU = (p: TzPlace) => (p.lng < 129 ? 'Australia/Perth' : p.lng < 141 ? (p.lat > -26 ? 'Australia/Darwin' : 'Australia/Adelaide') : p.lat > -29 ? 'Australia/Brisbane' : p.lat < -34 && p.lng < 150 ? 'Australia/Melbourne' : 'Australia/Sydney');

/** The IANA zone for a place, or null when we can't tell (the caller keeps what it had). */
export function tzForPlace(p: TzPlace | null | undefined): string | null {
  if (!p) return null;
  const region = (p.region ?? '').toUpperCase();
  if (p.country === 'US') return US_SPLIT[region]?.(p) ?? US[region] ?? null;
  if (p.country === 'CA') return CA[region] ?? null;
  if (p.country === 'AU') return AU(p);
  return COUNTRY[p.country] ?? null;
}

/** Zones a studio can choose by name when the city's zone is wrong for them. Named by zone, never by city. */
export const ZONE_NAMES: [string, string][] = [
  [ET, 'Eastern Time'], [CT, 'Central Time'], [MT, 'Mountain Time'], ['America/Phoenix', 'Arizona (no daylight saving)'], [PT, 'Pacific Time'],
  ['America/Anchorage', 'Alaska Time'], ['Pacific/Honolulu', 'Hawaii Time'], ['America/Halifax', 'Atlantic Time'],
  ['Europe/London', 'UK Time'], ['Europe/Paris', 'Central European Time'], ['Africa/Lagos', 'West Africa Time'], ['Africa/Johannesburg', 'South Africa Time'],
  ['Africa/Nairobi', 'East Africa Time'], ['Asia/Kolkata', 'India Time'], ['Asia/Tokyo', 'Japan Time'], ['Asia/Seoul', 'Korea Time'], ['Australia/Sydney', 'Australian Eastern Time'],
];
const ALIAS: Record<string, string> = { 'America/Toronto': ET, 'Europe/Berlin': 'Europe/Paris', 'Europe/Amsterdam': 'Europe/Paris', 'Europe/Stockholm': 'Europe/Paris', 'Europe/Madrid': 'Europe/Paris', 'Australia/Melbourne': 'Australia/Sydney' };
/** A plain name for a zone: "Central Time". Unknown zones fall back to the zone's own id, spaced. */
export const zoneName = (tz: string) => ZONE_NAMES.find(([id]) => id === (ALIAS[tz] ?? tz))?.[1] ?? tz.replace(/^.*\//, '').replace(/_/g, ' ') + ' time';
