/**
 * Public places a member can choose as their location.
 *
 * Privacy model:
 * - Members pick a place from this list. They never enter an address or coordinates.
 * - Every place has one public, generalized point (a well-known centre, not anyone's home).
 * - A "locality" (suburb or neighbouring city) belongs to a "metro". When the globe is zoomed
 *   out, everyone in Hoover counts toward the Birmingham metro. Zoomed in, Hoover can show on its own,
 *   but only when enough members share it (see MIN_LOCALITY_GROUP), so small groups can't be singled out.
 *
 * Ids are stable and stored in the database. Never change an id; add new places instead.
 */
import { CITIES } from './cities.ts';

export interface Place {
  id: string;
  name: string;
  region?: string;
  country: string;
  countryName: string;
  lat: number;
  lng: number;
  kind: 'metro' | 'locality';
  metroId: string; // for a metro, its own id
}

/** A locality is shown on its own only when at least this many members share it. */
export const MIN_LOCALITY_GROUP = 3;

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
export const metroId = (c: { name: string; region?: string; country: string }) =>
  [c.country, c.region, c.name].filter(Boolean).map((x) => slug(x!)).join('-');

const METROS: Place[] = CITIES.map((c) => ({
  id: metroId(c), name: c.name, region: c.region, country: c.country, countryName: c.countryName,
  lat: c.lat, lng: c.lng, kind: 'metro', metroId: metroId(c),
}));

// [metro name, locality name, lat, lng]. Centres are city-hall / town-centre level points.
const LOCALITIES: [string, string, number, number][] = [
  ['Birmingham', 'Hoover', 33.4054, -86.8114], ['Birmingham', 'Vestavia Hills', 33.4487, -86.7878],
  ['Birmingham', 'Homewood', 33.4718, -86.8008], ['Birmingham', 'Mountain Brook', 33.5009, -86.7522],
  ['Birmingham', 'Bessemer', 33.4018, -86.9544], ['Birmingham', 'Trussville', 33.6198, -86.6089],
  ['Birmingham', 'Pelham', 33.2857, -86.81], ['Birmingham', 'Alabaster', 33.2443, -86.8164],
  ['Atlanta', 'Decatur', 33.7748, -84.2963], ['Atlanta', 'Marietta', 33.9526, -84.5499],
  ['Atlanta', 'East Point', 33.6795, -84.4394], ['Atlanta', 'College Park', 33.6534, -84.4494],
  ['Atlanta', 'Sandy Springs', 33.9304, -84.3733], ['Atlanta', 'Stone Mountain', 33.8082, -84.1702],
  ['Nashville', 'Franklin', 35.9251, -86.8689], ['Nashville', 'Murfreesboro', 35.8456, -86.3903],
  ['Houston', 'Pearland', 29.5636, -95.286], ['Houston', 'Sugar Land', 29.6197, -95.6349],
  ['Dallas', 'Fort Worth', 32.7555, -97.3308], ['Dallas', 'Arlington', 32.7357, -97.1081],
  ['Miami', 'Miami Gardens', 25.942, -80.2456], ['Miami', 'Fort Lauderdale', 26.1224, -80.1373],
  ['New York', 'Brooklyn', 40.6782, -73.9442], ['New York', 'Queens', 40.7282, -73.7949],
  ['New York', 'The Bronx', 40.8448, -73.8648], ['New York', 'Manhattan', 40.7831, -73.9712],
  ['New York', 'Newark', 40.7357, -74.1724], ['New York', 'Jersey City', 40.7178, -74.0431],
  ['Chicago', 'Evanston', 42.0451, -87.6877], ['Chicago', 'Oak Park', 41.885, -87.7845],
  ['Los Angeles', 'Inglewood', 33.9617, -118.3531], ['Los Angeles', 'Compton', 33.8958, -118.2201],
  ['Los Angeles', 'Long Beach', 33.7701, -118.1937], ['Los Angeles', 'Pasadena', 34.1478, -118.1445],
  ['Los Angeles', 'Burbank', 34.1808, -118.309], ['Los Angeles', 'Santa Monica', 34.0195, -118.4912],
  ['San Francisco', 'Oakland', 37.8044, -122.2712], ['San Francisco', 'San Jose', 37.3382, -121.8863],
  ['Toronto', 'Mississauga', 43.589, -79.6441], ['Toronto', 'Brampton', 43.7315, -79.7624],
  ['London', 'Croydon', 51.3762, -0.0982], ['London', 'Peckham', 51.4741, -0.0697],
  ['London', 'Tottenham', 51.5975, -0.0681], ['London', 'Brixton', 51.4613, -0.1156],
  ['Lagos', 'Ikeja', 6.6018, 3.3515], ['Lagos', 'Lekki', 6.4698, 3.5852], ['Lagos', 'Surulere', 6.5, 3.35],
  ['Johannesburg', 'Soweto', -26.2485, 27.854], ['Johannesburg', 'Pretoria', -25.7479, 28.2293],
];

const LOCALITY_PLACES: Place[] = LOCALITIES.map(([metro, name, lat, lng]) => {
  const m = METROS.find((x) => x.name === metro);
  if (!m) throw new Error(`Unknown metro ${metro}`);
  return {
    id: metroId({ name, region: m.region, country: m.country }), name, region: m.region, country: m.country,
    countryName: m.countryName, lat, lng, kind: 'locality', metroId: m.id,
  };
});

export const PLACES: Place[] = [...METROS, ...LOCALITY_PLACES];
export const PLACE_BY_ID = new Map(PLACES.map((p) => [p.id, p]));

export const placeLabel = (p: Pick<Place, 'name' | 'region' | 'countryName'>) =>
  [p.name, p.region, p.countryName].filter(Boolean).join(', ');
