/**
 * Specialties: the professional roles a member works in.
 * A member has one Primary Specialty and any number of additional specialties.
 * Specialty (what you do) and Genre (the music you make) are separate on purpose.
 *
 * Keys are stable identifiers stored in the database and used in URLs (?specialty=producer).
 * Never rename a key; change the label instead.
 */
export const SPECIALTY_KEYS = [
  'recording-artist',
  'vocalist',
  'songwriter',
  'producer',
  'audio-engineer',
  'mixing-engineer',
  'mastering-engineer',
  'dj',
  'instrumentalist',
  'composer',
  'arranger',
  'photographer',
  'videographer',
  'creative',
] as const;

export type Specialty = (typeof SPECIALTY_KEYS)[number];

export const SPECIALTIES: Record<Specialty, { label: string; plural: string; blurb: string }> = {
  'recording-artist': { label: 'Recording Artist', plural: 'Recording Artists', blurb: 'Artists, rappers and performers releasing original work.' },
  vocalist: { label: 'Vocalist', plural: 'Vocalists', blurb: 'Lead, session and background vocalists.' },
  songwriter: { label: 'Songwriter', plural: 'Songwriters', blurb: 'Writers and topliners behind the songs people remember.' },
  producer: { label: 'Music Producer', plural: 'Music Producers', blurb: 'Producers and beatmakers shaping the sound from the ground up.' },
  'audio-engineer': { label: 'Audio Engineer', plural: 'Audio Engineers', blurb: 'Recording engineers who capture the performance.' },
  'mixing-engineer': { label: 'Mixing Engineer', plural: 'Mixing Engineers', blurb: 'Engineers who balance and shape the final mix.' },
  'mastering-engineer': { label: 'Mastering Engineer', plural: 'Mastering Engineers', blurb: 'The last ears before release.' },
  dj: { label: 'DJ', plural: 'DJs', blurb: 'Club, radio and touring DJs.' },
  instrumentalist: { label: 'Instrumentalist', plural: 'Instrumentalists', blurb: 'Session and touring players on every instrument.' },
  composer: { label: 'Composer', plural: 'Composers', blurb: 'Composers for records, film, games and media.' },
  arranger: { label: 'Arranger', plural: 'Arrangers', blurb: 'Arrangers for strings, horns, choirs and bands.' },
  photographer: { label: 'Photographer', plural: 'Photographers', blurb: 'Press, cover art and live photographers.' },
  videographer: { label: 'Videographer', plural: 'Videographers', blurb: 'Music video directors, editors and live-session crews.' },
  creative: { label: 'Other Creative', plural: 'Other Creatives', blurb: 'Designers, stylists and other creatives who work with musicians.' },
};

/** Old URL values (from the "discipline" era) mapped to current keys. */
const LEGACY: Record<string, Specialty> = { 'multi-disciplinary': 'recording-artist' };

export function toSpecialty(v: string | null | undefined): Specialty | '' {
  if (!v) return '';
  if ((SPECIALTY_KEYS as readonly string[]).includes(v)) return v as Specialty;
  return LEGACY[v] ?? '';
}

/** Primary first, then additional, without duplicates. */
export const allSpecialties = (primary: Specialty, additional: Specialty[] = []) => [primary, ...additional.filter((s) => s !== primary)];
