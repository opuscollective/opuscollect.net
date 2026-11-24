/**
 * Progress on Opus: levels, achievements and titles.
 *
 * Everything here is computed from recorded activity (works, confirmed credits, accepted connections,
 * groups, listening parties). Nothing is entered by hand, nothing can be bought, and nothing is estimated.
 * Real work weighs more than connection counts, and connections stop adding points past a cap, so
 * collecting connections alone can't carry a level.
 *
 * NOTE: level names, achievement names and titles are PROPOSED copy awaiting Bogo's sign-off.
 * Change them here; ids must stay stable because members save them in their page settings.
 */

/** Counts taken straight from the database for one member. */
export interface Stats {
  works: number;            // published works they own
  creditsEarned: number;    // confirmed credits on other members' published works
  creditsGiven: number;     // other members who confirmed a credit on this member's works
  connections: number;      // accepted connections
  connectionCities: number; // distinct metro areas among their connections
  connectionCountries: number;
  groups: number;           // groups where they are an active member
  partiesHosted: number;    // listening parties they hosted that ran and ended
  partyPeak: number;        // the most listeners in one of their rooms at once
  published: boolean;       // profile is live
  hasPhoto: boolean;
  verified: boolean;
}

export const NO_STATS: Stats = {
  works: 0, creditsEarned: 0, creditsGiven: 0, connections: 0, connectionCities: 0, connectionCountries: 0,
  groups: 0, partiesHosted: 0, partyPeak: 0, published: false, hasPhoto: false, verified: false,
};

/** Points per source, with caps. Work and confirmed credits lead; connections are capped. */
export const POINTS = {
  profile: 30,                                   // published profile with a photo
  work: { each: 40, cap: 25 },
  creditEarned: { each: 60, cap: 40 },
  creditGiven: { each: 30, cap: 30 },
  connection: { each: 10, cap: 30 },
  group: { each: 40, cap: 3 },
  party: { each: 50, cap: 10 },
} as const;

export function points(s: Stats): number {
  const part = (n: number, r: { each: number; cap: number }) => Math.min(Math.max(0, Math.floor(n)), r.cap) * r.each;
  return (s.published && s.hasPhoto ? POINTS.profile : 0)
    + part(s.works, POINTS.work) + part(s.creditsEarned, POINTS.creditEarned) + part(s.creditsGiven, POINTS.creditGiven)
    + part(s.connections, POINTS.connection) + part(s.groups, POINTS.group) + part(s.partiesHosted, POINTS.party);
}

/** Level thresholds in points. Names are proposed copy. */
export const LEVELS: readonly { at: number; name: string }[] = [
  { at: 0, name: 'Newcomer' },
  { at: 100, name: 'Local' },
  { at: 250, name: 'Regular' },
  { at: 500, name: 'Contributor' },
  { at: 900, name: 'Collaborator' },
  { at: 1400, name: 'Fixture' },
  { at: 2000, name: 'Headliner' },
  { at: 2800, name: 'Mainstay' },
  { at: 3800, name: 'Luminary' },
  { at: 5000, name: 'Legacy' },
];

export interface Level { level: number; name: string; points: number; floor: number; next: number | null; nextName: string | null; progress: number }

export function levelOf(pts: number): Level {
  let i = 0;
  while (i + 1 < LEVELS.length && pts >= LEVELS[i + 1]!.at) i++;
  const cur = LEVELS[i]!, nxt = LEVELS[i + 1] ?? null;
  return {
    level: i + 1, name: cur.name, points: pts, floor: cur.at, next: nxt?.at ?? null, nextName: nxt?.name ?? null,
    progress: nxt ? Math.min(1, Math.max(0, (pts - cur.at) / (nxt.at - cur.at))) : 1,
  };
}

export type AchievementGroup = 'work' | 'credits' | 'people' | 'live' | 'standing';
export interface Achievement {
  id: string; name: string; group: AchievementGroup;
  /** What it took, as shown to everyone. */
  how: string;
  /** A title the member can wear under their name once earned. */
  title?: string;
  /** The stat it reads and the number needed. */
  stat: keyof Stats; need: number;
  /** 1 to 3: how much it stands for. Used to pick what to show first. */
  tier: 1 | 2 | 3;
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first-work', name: 'First Work', group: 'work', how: 'Published a first work', stat: 'works', need: 1, tier: 1 },
  { id: 'catalog-5', name: 'Catalog', group: 'work', how: 'Published 5 works', title: 'Catalog Builder', stat: 'works', need: 5, tier: 2 },
  { id: 'catalog-15', name: 'Deep Catalog', group: 'work', how: 'Published 15 works', title: 'Prolific', stat: 'works', need: 15, tier: 3 },

  { id: 'credited', name: 'Credited', group: 'credits', how: 'Confirmed a credit on another member’s work', stat: 'creditsEarned', need: 1, tier: 1 },
  { id: 'credits-5', name: 'In Demand', group: 'credits', how: 'Confirmed credits on 5 works by others', title: 'In Demand', stat: 'creditsEarned', need: 5, tier: 2 },
  { id: 'credits-20', name: 'On Every Record', group: 'credits', how: 'Confirmed credits on 20 works by others', title: 'First Call', stat: 'creditsEarned', need: 20, tier: 3 },
  { id: 'gives-credit', name: 'Gives Credit', group: 'credits', how: '3 collaborators confirmed credits on their works', title: 'Team Player', stat: 'creditsGiven', need: 3, tier: 2 },

  { id: 'first-connection', name: 'First Connection', group: 'people', how: 'Made a first connection', stat: 'connections', need: 1, tier: 1 },
  { id: 'connections-10', name: 'Connector', group: 'people', how: '10 connections', title: 'Connector', stat: 'connections', need: 10, tier: 1 },
  { id: 'connections-50', name: 'Well Connected', group: 'people', how: '50 connections', title: 'Well Connected', stat: 'connections', need: 50, tier: 2 },
  { id: 'connections-150', name: 'Hub', group: 'people', how: '150 connections', title: 'The Hub', stat: 'connections', need: 150, tier: 3 },
  { id: 'cities-3', name: 'Three Cities', group: 'people', how: 'Connections in 3 cities', title: 'Bridge Builder', stat: 'connectionCities', need: 3, tier: 2 },
  { id: 'countries-3', name: 'Worldwide', group: 'people', how: 'Connections in 3 countries', title: 'Worldwide', stat: 'connectionCountries', need: 3, tier: 3 },
  { id: 'in-a-group', name: 'In a Group', group: 'people', how: 'Active member of a group', stat: 'groups', need: 1, tier: 1 },

  { id: 'host', name: 'Host', group: 'live', how: 'Hosted a listening party', title: 'Host', stat: 'partiesHosted', need: 1, tier: 1 },
  { id: 'host-5', name: 'Regular Host', group: 'live', how: 'Hosted 5 listening parties', title: 'Tastemaker', stat: 'partiesHosted', need: 5, tier: 2 },
  { id: 'full-room', name: 'Full Room', group: 'live', how: '25 people in one listening party at once', title: 'Full Room', stat: 'partyPeak', need: 25, tier: 3 },
];

export const GROUP_LABEL: Record<AchievementGroup, string> = { work: 'Work', credits: 'Credits', people: 'People', live: 'Live', standing: 'Standing' };

const num = (v: Stats[keyof Stats]) => (typeof v === 'number' ? v : v ? 1 : 0);

export interface Earned extends Achievement { earned: boolean; have: number }

/** Every achievement with whether it is earned and how far along the member is. */
export function achievements(s: Stats): Earned[] {
  return ACHIEVEMENTS.map((a) => { const have = num(s[a.stat]); return { ...a, earned: have >= a.need, have: Math.min(have, a.need) }; });
}

/** The unearned achievements closest to done, for the member's own view. */
export function nextUp(all: Earned[], n = 3): Earned[] {
  return all.filter((a) => !a.earned).sort((a, b) => b.have / b.need - a.have / a.need || a.need - b.need || a.tier - b.tier).slice(0, n);
}

export interface TitleOption { key: string; label: string; from: string }

/**
 * Titles a member may wear: their level name, and the title of each achievement they earned.
 * `distinction` adds titles that are granted on the account (Founder), never earned or chosen freely.
 */
export function titleOptions(s: Stats, distinction: string | null = null): TitleOption[] {
  const lv = levelOf(points(s));
  const out: TitleOption[] = [];
  if (distinction === 'founder') out.push({ key: 'founder', label: 'Founder', from: 'Granted to the founder of Opus' });
  out.push({ key: 'level', label: lv.name, from: `Level ${lv.level}` });
  for (const a of achievements(s)) if (a.earned && a.title) out.push({ key: `a:${a.id}`, label: a.title, from: a.how });
  return out;
}

/** The label for a saved title key, or null if the member hasn't earned it (so a stale choice never shows). */
export function resolveTitle(key: string | null | undefined, s: Stats, distinction: string | null = null): string | null {
  if (!key) return null;
  return titleOptions(s, distinction).find((t) => t.key === key)?.label ?? null;
}
