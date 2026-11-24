/**
 * The line Opus greets a signed-in member with: by time of day at home, by city when they're away.
 * Pure and deterministic (the variant turns over once a day), so the server and the page agree.
 * All lines are WORKING COPY for Bogo to confirm; keep them short and in Opus's plain voice.
 */
export interface GreetInput { name?: string | null; hour: number; day?: number; home?: string | null; away?: string | null }
export interface Greeting { line: string; sub: string; city: string | null }

export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';
export const dayPart = (hour: number): DayPart => (hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'afternoon' : hour >= 17 && hour < 22 ? 'evening' : 'night');

/** {n} is the member's first name. A line without a name is used as is when no name is known. */
const AT_HOME: Record<DayPart, string[]> = {
  morning: ['Good morning, {n}.', 'Morning, {n}. Coffee and Opus.', 'New day, {n}.'],
  afternoon: ['Good afternoon, {n}.', 'Afternoon, {n}. Back to work.', 'Good to see you, {n}.'],
  evening: ['Good evening, {n}.', 'Evening, {n}. Session time.', 'Welcome back, {n}.'],
  night: ['Late session, {n}.', 'Still up, {n}.', 'The quiet hours, {n}.'],
};
const AWAY = ['Welcome to {c}.', 'Welcome to {c}, {n}.', '{c}. New territory.'];

const first = (name?: string | null) => (name ?? '').trim().split(/\s+/)[0] ?? '';
/** Drop the name politely when it isn't known: "Good morning, {n}." becomes "Good morning." */
const fill = (t: string, n: string, c = '') => (n ? t.replace('{n}', n) : t.replace(/,? \{n\}/, '')).replace('{c}', c);

export function greeting(i: GreetInput): Greeting {
  const n = first(i.name);
  const day = Math.abs(Math.floor(i.day ?? 0));
  if (i.away && i.away !== i.home) {
    return { line: fill(AWAY[day % AWAY.length]!, n, i.away), sub: `See what’s happening in ${i.away}.`, city: i.away };
  }
  const set = AT_HOME[dayPart(i.hour)];
  return { line: fill(set[day % set.length]!, n), sub: i.home ? `Here’s what’s happening in ${i.home}.` : 'Here’s what’s happening on Opus.', city: i.home ?? null };
}

/** Day of the year in the viewer's own clock, for the daily variant. */
export const dayOfYear = (d: Date) => Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86_400_000);
