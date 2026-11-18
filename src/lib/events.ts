/**
 * Events on Opus: shared, pure helpers (labels, time zones, date formatting). The server and pages
 * both import these. No database here.
 */
import { tzAbbr, localDay, partsIn } from './booking-time.ts';

export const CATEGORIES = {
  performance: 'Performance',
  open_mic: 'Open mic',
  showcase: 'Showcase',
  listening_party: 'Listening party',
  workshop: 'Workshop',
  networking: 'Networking',
  conference: 'Conference',
  other: 'Other',
} as const;
export type EventCategory = keyof typeof CATEGORIES;
export const isCategory = (v: unknown): v is EventCategory => typeof v === 'string' && v in CATEGORIES;

/** Time zones offered in the event form. Any valid IANA zone is accepted by the server. */
export const EVENT_ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
  'America/Toronto', 'America/Mexico_City', 'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Africa/Lagos', 'Africa/Johannesburg', 'Asia/Tokyo', 'Australia/Sydney'];

/** A member's relationship to an event. None of these is a ticket or an RSVP the organizer sees as confirmed. */
export const RELATIONS = { saved: 'Saved', interested: 'Interested', going: 'Going' } as const;
export type EventRelation = keyof typeof RELATIONS;
export const isRelation = (v: unknown): v is EventRelation => typeof v === 'string' && v in RELATIONS;

const pad = (n: number) => String(n).padStart(2, '0');
/** "HH:MM" wall time of an instant in a zone, for form inputs. */
export function localTime(ts: number, tz: string) {
  const p = partsIn(ts, tz);
  return `${pad(p.h)}:${pad(p.min)}`;
}

const TIME = (tz: string) => new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });

/**
 * When an event happens, in the event's own time zone, so it reads the same for everyone:
 * "Sat, Dec 6 · 8:00 PM – 11:00 PM CST" or "Sat, Dec 6 · 8:00 PM CST – Sun, Dec 7 · 2:00 AM CST".
 */
export function formatEventWhen(startAt: number, endAt: number | null, tz: string, nowMs = Date.now()) {
  const slot = (ts: number) => {
    const year = partsIn(ts, tz).y !== partsIn(nowMs, tz).y;
    const date = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) }).format(new Date(ts));
    return `${date} · ${TIME(tz).format(new Date(ts))}`;
  };
  const start = slot(startAt);
  if (!endAt) return `${start} ${tzAbbr(startAt, tz)}`;
  if (localDay(endAt, tz) === localDay(startAt, tz)) return `${start} – ${TIME(tz).format(new Date(endAt))} ${tzAbbr(endAt, tz)}`;
  return `${start} ${tzAbbr(startAt, tz)} – ${slot(endAt)} ${tzAbbr(endAt, tz)}`;
}

/** An event is over once its end (or, without one, its start plus 3 hours) has passed. */
export const eventEndsAt = (startAt: number, endAt: number | null) => endAt ?? startAt + 3 * 3_600_000;
