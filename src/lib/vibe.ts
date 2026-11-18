/**
 * Vibe matching for "find people for this song".
 * A release describes its vibe with genres and moods. A member's vibe is their profile genres plus
 * the moods of releases they're confirmed on, so it sharpens as they build a record on Opus.
 * Plain scoring, no audio analysis. Run the tests with `npm test`.
 */
export interface ReleaseVibe { genres: string[]; moods: string[] }
export interface MemberVibe {
  genres: string[];
  /** Moods from the member's confirmed releases, with repeats (a mood on three releases counts more). */
  moods: string[];
}
export interface VibeMatch { score: number; genres: string[]; moods: string[] }

const GENRE_WEIGHT = 3;
const MOOD_WEIGHT = 2;
/** Moods seen on several of a member's releases add a little more, up to this many times. */
const MOOD_REPEAT_CAP = 3;

export function vibeMatch(release: ReleaseVibe, member: MemberVibe): VibeMatch {
  const memberGenres = new Set(member.genres);
  const genres = release.genres.filter((g) => memberGenres.has(g));
  const counts = new Map<string, number>();
  for (const m of member.moods) counts.set(m, (counts.get(m) ?? 0) + 1);
  const moods = release.moods.filter((m) => counts.has(m));
  let score = genres.length * GENRE_WEIGHT;
  for (const m of moods) score += MOOD_WEIGHT + Math.min(counts.get(m)! - 1, MOOD_REPEAT_CAP - 1) * 0.5;
  return { score, genres, moods };
}

/** Sort best match first; ties go to members open to collaborating, then by name. */
export function rankByVibe<T extends { name: string; openToCollab: boolean; match: VibeMatch }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.match.score - a.match.score || Number(b.openToCollab) - Number(a.openToCollab) || a.name.localeCompare(b.name));
}
