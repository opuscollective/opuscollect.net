/**
 * Editorial city guides for World. One entry per city that has one; every other city shows the plain guide
 * (name, region and live counts) and can be added here later without touching the components.
 *
 * Rules for an entry:
 * - The photo is a real photograph of that city, under a licence that allows this use, credited exactly as the
 *   licence asks. Files live in public/images/cities/<slug>/ with SOURCES.md beside them.
 * - Intro and history state only well-documented facts. No invented scenes, people or numbers.
 * - Counts are never stored here: World computes them live from published members.
 */
export interface CityPhoto {
  /** Base path without the width suffix, e.g. /images/cities/birmingham/skyline → skyline-1600.webp */
  base: string;
  widths: number[];
  /** Intrinsic aspect ratio of the panorama (width / height). */
  ratio: number;
  alt: string;
  credit: string;
  creditUrl: string;
  license: string;
  licenseUrl: string;
  /** Average colour, painted while the image loads and kept if it fails. */
  tone: string;
  /** Horizontal focus for object-position, 0–100. */
  focusX?: number;
}

export interface CityGuideEntry {
  /** Metro id from src/data/places.ts (follows and events use this key). */
  id: string;
  slug: string;
  name: string;
  region: string;
  intro: string;
  /** Short paragraphs, shown behind "Music history". */
  history: string[];
  photo?: CityPhoto;
}

export const CITY_GUIDES: Record<string, CityGuideEntry> = {
  birmingham: {
    id: 'us-al-birmingham',
    slug: 'birmingham',
    name: 'Birmingham',
    region: 'Alabama, United States',
    intro: 'Founded in 1871 where railroads crossed beside deposits of iron ore, coal and limestone, Birmingham grew so fast it was called the Magic City. Today it is a city of neighborhoods, venues and studios with a deep musical inheritance.',
    history: [
      'Jazz runs through the city’s story. Erskine Hawkins, born in Birmingham, named his 1939 hit “Tuxedo Junction” after a streetcar stop and dance hall in the Ensley neighborhood. Sun Ra was born here as Herman Poole Blount in 1914.',
      'In the first half of the twentieth century, the Birmingham area was a center of a cappella gospel quartet singing, a tradition that shaped gospel and vocal-group music far beyond Alabama.',
      'The Alabama Jazz Hall of Fame is housed in the historic Carver Theatre in the Fourth Avenue district, and the Alabama Theatre, opened in 1927, still sounds its Mighty Wurlitzer organ.',
    ],
    photo: {
      base: '/images/cities/birmingham/skyline',
      widths: [800, 1280, 1920],
      ratio: 2.4,
      alt: 'Downtown Birmingham’s skyline at dusk, reflected in a park pond.',
      credit: 'Zachary Farmer',
      creditUrl: 'https://unsplash.com/photos/landscape-photography-of-cityscape-by-water-TkunxoS98q0',
      license: 'Unsplash License',
      licenseUrl: 'https://unsplash.com/license',
      tone: '#3b4b6e',
      focusX: 50,
    },
  },
};

export const guideFor = (slug: string | undefined | null): CityGuideEntry | undefined => (slug ? CITY_GUIDES[slug] : undefined);

/** srcset for a city photo. */
export const photoSrcset = (p: CityPhoto) => p.widths.map((w) => `${p.base}-${w}.webp ${w}w`).join(', ');
export const photoSrc = (p: CityPhoto) => `${p.base}-${p.widths[Math.min(1, p.widths.length - 1)]}.webp`;
