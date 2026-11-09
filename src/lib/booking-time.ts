/**
 * Time-zone aware availability for Opus Bookings. Pure functions, shared by the server and tests.
 *
 * Studios set opening hours in their own local time (minutes after local midnight, by weekday).
 * Bookings are stored as UTC epoch milliseconds. Conversions go through Intl, so daylight
 * saving changes are handled by the platform's time-zone database.
 */
export const SLOT_MS = 15 * 60_000; // conflict-checking granularity
export const DAY_MS = 86_400_000;

export interface Rule { weekday: number; start_min: number; end_min: number }

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    fmtCache.set(tz, f);
  }
  return f;
}

export function isTimeZone(tz: string) {
  try { fmt(tz); return true; } catch { return false; }
}

/** Wall-clock parts of a UTC instant in a time zone. */
export function partsIn(ts: number, tz: string) {
  const p: Record<string, number> = {};
  for (const x of fmt(tz).formatToParts(new Date(ts))) if (x.type !== 'literal') p[x.type] = Number(x.value);
  return { y: p.year!, m: p.month!, d: p.day!, h: p.hour! % 24, min: p.minute!, s: p.second! };
}

/** Offset of the zone from UTC at an instant, in ms (e.g. -5 h for Chicago in summer). */
export function offsetAt(ts: number, tz: string) {
  const p = partsIn(ts, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(ts / 1000) * 1000;
}

/** UTC instant for a local wall time: day 'YYYY-MM-DD' + minutes after local midnight. */
export function zonedToUtc(day: string, minutes: number, tz: string) {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const naive = Date.UTC(y, m - 1, d, 0, minutes);
  let ts = naive - offsetAt(naive, tz);
  const again = naive - offsetAt(ts, tz); // second pass settles DST boundaries
  if (again !== ts) ts = again;
  return ts;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Local calendar day of an instant, 'YYYY-MM-DD'. */
export function localDay(ts: number, tz: string) {
  const p = partsIn(ts, tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}
export function addDays(day: string, n: number) {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
export const weekdayOf = (day: string) => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
export const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/** The 15-minute cells a booking occupies, including its buffer. */
export function cells(startAt: number, minutes: number) {
  const out: number[] = [];
  const first = Math.floor(startAt / SLOT_MS) * SLOT_MS;
  for (let t = first; t < startAt + minutes * 60_000; t += SLOT_MS) out.push(t);
  return out;
}

export interface SlotQuery {
  tz: string;
  rules: Rule[];
  closedDays: Set<string>;
  taken: Set<number>;       // occupied cells for the room
  durationMin: number;
  bufferMin: number;
  stepMin?: number;         // spacing of offered start times
  minNoticeHours: number;
  maxDaysAhead: number;
  now: number;
  fromDay: string;
  days: number;
}

/** Bookable start times per local day. A start is offered only if every cell it needs is free. */
export function availableSlots(q: SlotQuery): { day: string; starts: number[] }[] {
  const step = q.stepMin ?? 30;
  const earliest = q.now + q.minNoticeHours * 3_600_000;
  const latest = q.now + q.maxDaysAhead * DAY_MS;
  const out: { day: string; starts: number[] }[] = [];
  for (let i = 0; i < q.days; i++) {
    const day = addDays(q.fromDay, i);
    const starts: number[] = [];
    if (!q.closedDays.has(day)) {
      const wd = weekdayOf(day);
      const rules = q.rules.filter((r) => r.weekday === wd).sort((a, b) => a.start_min - b.start_min);
      for (const r of rules) {
        for (let m = r.start_min; m + q.durationMin <= r.end_min; m += step) {
          const at = zonedToUtc(day, m, q.tz);
          if (at < earliest || at > latest) continue;
          if (cells(at, q.durationMin + q.bufferMin).some((c) => q.taken.has(c))) continue;
          if (!starts.includes(at)) starts.push(at);
        }
      }
    }
    out.push({ day, starts: starts.sort((a, b) => a - b) });
  }
  return out;
}

/** "Tue, Nov 11 · 2:00 PM" in the studio's zone. */
export function formatSlot(ts: number, tz: string, withDate = true) {
  const time = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(ts));
  if (!withDate) return time;
  const date = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(ts));
  return `${date} · ${time}`;
}
export function tzAbbr(ts: number, tz: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(ts)).find((p) => p.type === 'timeZoneName')?.value ?? tz;
}

export const money = (cents: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
