/** Feedback: shared limits, used by the forms and the server. See src/server/feedback.ts. */
export const FEEDBACK = {
  titleMax: 120,
  artistMax: 80,
  askMax: 140,
  /** Comments are optional and can be short. */
  noteMax: 1000,
  /** Tracks one member can post in a week, so the feed stays a place to listen, not a place to drop links. */
  tracksPerWeek: 3,
} as const;

/** "3 h ago" for the feed. */
export function ago(t: number, nowMs = Date.now()): string {
  const s = Math.max(0, (nowMs - t) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(t);
}
