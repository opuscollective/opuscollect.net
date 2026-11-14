/**
 * Future: one timeline of what is coming up on Opus for a person, built from data Opus already
 * keeps (studio bookings, planned releases, Collective events). Pure helpers, no database here.
 */
export type FutureKind = 'session' | 'release' | 'event';

export interface FutureItem {
  id: string;
  kind: FutureKind;
  title: string;
  /** Second line: studio, customer, release type or place. */
  detail: string;
  /** Shown date text, already formatted ("Tue, Nov 18 · 2:00 PM CST", "Mar 6, 2027", "Summer 2027"). */
  when: string;
  /** YYYY-MM-DD used for ordering and month grouping; null = no date yet. */
  day: string | null;
  /** Sort key within a day (ms). */
  at: number;
  status?: string;
  href: string;
}

export interface FutureMonth { key: string; label: string; items: FutureItem[] }

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Upcoming items in order, grouped by month; undated items last under "No date yet". */
export function groupByMonth(items: FutureItem[], today: string): FutureMonth[] {
  const dated = items.filter((i) => i.day && i.day >= today).sort((a, b) => (a.day! < b.day! ? -1 : a.day! > b.day! ? 1 : a.at - b.at));
  const out: FutureMonth[] = [];
  for (const i of dated) {
    const key = i.day!.slice(0, 7);
    let m = out[out.length - 1];
    if (!m || m.key !== key) {
      const [y, mo] = key.split('-').map(Number) as [number, number];
      m = { key, label: MONTH.format(new Date(Date.UTC(y, mo - 1, 1))), items: [] };
      out.push(m);
    }
    m.items.push(i);
  }
  const undated = items.filter((i) => !i.day);
  if (undated.length) out.push({ key: 'tba', label: 'No date yet', items: undated });
  return out;
}

/** "2027-03-06" -> "Fri, Mar 6, 2027" without time-zone drift. */
export function formatDay(day: string) {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

export const KIND_LABEL: Record<FutureKind, string> = { session: 'Session', release: 'Release', event: 'Event' };
