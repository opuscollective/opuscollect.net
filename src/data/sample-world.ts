/**
 * SAMPLE DATA — development only.
 * None of these listings are real people, studios or companies. Every card and
 * marker built from this file is labeled "Sample". Replace with D1 queries in Phase 3.
 * Generated deterministically so the map looks the same on every build.
 */
import type { Specialty } from '@/data/specialties';
import { ORG_CATEGORY_LABEL, type Listing, type MusicianListing, type StudioListing, type OrganizationListing, type GeoPoint, type OrganizationCategory } from '@/types/directory';
import { CITIES, type City } from './cities';

// Small seeded RNG (mulberry32) so output is stable.
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = rng(20261108);
const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]!;
const pad = (n: number) => String(n).padStart(2, '0');

/** Offset a point by up to `km` kilometres. Used to avoid stacking and to blur private locations. */
function near(c: City, km: number, precision: GeoPoint['precision']): GeoPoint {
  const dLat = ((r() - 0.5) * 2 * km) / 111;
  const dLng = ((r() - 0.5) * 2 * km) / (111 * Math.cos((c.lat * Math.PI) / 180));
  return { city: c.name, region: c.region, country: c.country, lat: +(c.lat + dLat).toFixed(4), lng: +(c.lng + dLng).toFixed(4), precision };
}

const city = (name: string) => CITIES.find((c) => c.name === name)!;

// Where sample listings are placed, and how many musicians in each city.
const SPREAD: [string, number][] = [
  ['Birmingham', 6], ['Atlanta', 7], ['Nashville', 4], ['Los Angeles', 6], ['New York', 6], ['Houston', 3],
  ['Chicago', 3], ['Miami', 3], ['Toronto', 3], ['London', 5], ['Lagos', 4], ['Paris', 2], ['Berlin', 2],
  ['Johannesburg', 2], ['São Paulo', 2], ['Seoul', 2], ['Tokyo', 1], ['Kingston', 2], ['Accra', 2], ['Sydney', 1],
];

const GENRES: Record<string, string[]> = {
  default: ['Hip-Hop', 'R&B', 'Pop', 'Alternative', 'Soul', 'Electronic', 'Indie', 'Gospel', 'Jazz'],
  Nashville: ['Country', 'Americana', 'Indie', 'Pop'],
  Lagos: ['Afrobeats', 'Afro-fusion', 'R&B'], Accra: ['Afrobeats', 'Highlife', 'Hip-Hop'],
  Johannesburg: ['Amapiano', 'Afro-house', 'Hip-Hop'], Kingston: ['Dancehall', 'Reggae'],
  'São Paulo': ['Funk', 'MPB', 'Electronic'], Seoul: ['K-Pop', 'R&B'], Berlin: ['Techno', 'Electronic'],
  London: ['UK Rap', 'Grime', 'R&B', 'Electronic'], Atlanta: ['Hip-Hop', 'Trap', 'R&B'],
};
// [primary, ...additional]
const SPECIALTY_CYCLE: Specialty[][] = [
  ['recording-artist'], ['producer'], ['audio-engineer'], ['songwriter'], ['recording-artist', 'songwriter'],
  ['producer', 'mixing-engineer'], ['vocalist', 'songwriter'], ['dj', 'producer'], ['instrumentalist'],
  ['mastering-engineer', 'mixing-engineer'], ['composer', 'arranger'],
];
const LABEL: Record<Specialty, string> = {
  'recording-artist': 'Artist', vocalist: 'Vocalist', songwriter: 'Writer', producer: 'Producer', 'audio-engineer': 'Engineer',
  'mixing-engineer': 'Mixer', 'mastering-engineer': 'Mastering', dj: 'DJ', instrumentalist: 'Player', composer: 'Composer', arranger: 'Arranger',
};

const musicians: MusicianListing[] = [];
let n = 0;
for (const [name, count] of SPREAD) {
  const c = city(name);
  for (let i = 0; i < count; i++) {
    n++;
    const [primary, ...additional] = SPECIALTY_CYCLE[n % SPECIALTY_CYCLE.length]!;
    const pool = GENRES[name] ?? GENRES.default!;
    const g1 = pick(pool); let g2 = pick(pool); if (g2 === g1) g2 = pool[(pool.indexOf(g1) + 1) % pool.length]!;
    musicians.push({
      id: `m-${pad(n)}`, kind: 'musician', slug: `sample-${LABEL[primary!].toLowerCase()}-${pad(n)}`,
      name: `Sample ${LABEL[primary!]} ${pad(n)}`,
      location: near(c, 9, 'approximate'),
      primarySpecialty: primary!, specialties: additional, genres: [g1, g2], verification: r() < 0.22 ? 'verified' : 'none', openToCollab: r() < 0.7,
      highlight: r() < 0.5 ? 'Sample achievement line' : undefined, isSample: true,
    });
  }
}

const STUDIO_CITIES = ['Birmingham', 'Birmingham', 'Atlanta', 'Atlanta', 'Atlanta', 'Nashville', 'Los Angeles', 'Los Angeles', 'New York', 'Houston', 'Miami', 'London', 'London', 'Lagos', 'Toronto', 'Berlin', 'Johannesburg'];
const SERVICES = ['Recording', 'Mixing', 'Mastering', 'Vocal production', 'Podcast', 'Rehearsal'];
const GEAR = ['Neumann U87', 'SSL console', 'Pro Tools HDX', 'Apollo x8', 'Yamaha NS10', 'Neve 1073', 'Avalon 737', 'Focal monitors', 'Shure SM7B'];
const studios: StudioListing[] = STUDIO_CITIES.map((name, i) => {
  const c = city(name);
  const home = i % 3 === 1;
  const v = r();
  return {
    id: `s-${pad(i + 1)}`, kind: 'studio', slug: `sample-studio-${pad(i + 1)}`,
    name: home ? `Sample Home Studio ${pad(i + 1)}` : `Sample Studio ${pad(i + 1)}`,
    location: near(c, home ? 10 : 6, home ? 'approximate' : 'exact'),
    studioType: home ? 'home' : 'commercial',
    services: [SERVICES[i % 6]!, SERVICES[(i + 2) % 6]!],
    equipment: [GEAR[i % GEAR.length]!, GEAR[(i + 3) % GEAR.length]!, GEAR[(i + 5) % GEAR.length]!],
    hourlyRate: { amount: home ? 25 + Math.round(r() * 5) * 5 : 50 + Math.round(r() * 14) * 5, currency: 'USD' },
    verification: v < 0.2 ? 'studio' : v < 0.45 ? 'identity' : 'none',
    plan: 'none', acceptsBookingRequests: false, isSample: true,
  };
});

const ORGS: [string, OrganizationCategory, string[]][] = [
  ['Atlanta', 'label', ['Releases', 'A&R']], ['Birmingham', 'collective', ['Community', 'Showcases']],
  ['Los Angeles', 'management', ['Artist management']], ['New York', 'marketing', ['Campaigns', 'PR']],
  ['London', 'label', ['Releases', 'Publishing']], ['Lagos', 'management', ['Artist management', 'Touring']],
  ['Toronto', 'collective', ['Community']], ['Nashville', 'marketing', ['Playlisting', 'Social']],
];
const CAT_LABEL = ORG_CATEGORY_LABEL;
const organizations: OrganizationListing[] = ORGS.map(([name, category, services], i) => ({
  id: `o-${pad(i + 1)}`, kind: 'organization', slug: `sample-org-${pad(i + 1)}`,
  name: `Sample ${CAT_LABEL[category]} ${pad(i + 1)}`, location: near(city(name), 5, 'exact'),
  category, services, verified: false, isSample: true,
  summary: 'Sample organization for the preview build. Not a real company.',
}));

export const SAMPLE_LISTINGS: Listing[] = [...musicians, ...studios, ...organizations];
