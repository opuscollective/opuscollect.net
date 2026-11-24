/**
 * Listening parties: the shared clock. Pure helpers used by the room (server) and the player (browser).
 *
 * Nothing is streamed. The room holds one small fact: "track N was at `pos` ms when the room's clock
 * read `at`". Every device works out where the music is right now from that, so someone who joins
 * two minutes late starts at 2:00.
 */
export type PartyStatus = 'lobby' | 'playing' | 'paused' | 'ended';
export interface PartyState { status: PartyStatus; track: number; pos: number; at: number }

export const LOBBY_OPENS_MS = 30 * 60_000;       // the room opens this long before the start time
export const SOON_MS = 24 * 3_600_000;           // "Starting soon" in World
export const LISTED_AHEAD_MS = 14 * 86_400_000;  // how far ahead parties are listed
export const PAUSE_LIMIT_MS = 30 * 60_000;       // a party left paused this long ends itself
export const MAX_LIVE_MS = 6 * 3_600_000;
export const MAX_TRACKS = 30;
export const MAX_AUDIO_BYTES = 95 * 1024 * 1024; // under the Workers request limit
export const MAX_VISUAL_BYTES = 95 * 1024 * 1024;
export const CHAT_MAX = 300;
export const CHAT_COOLDOWN_MS = 2_000;
export const HIDE_AFTER_REPORTS = 3;
export const REACTIONS = ['🔥', '❤️', '👏', '🙌', '🤯'] as const;

export const AUDIO_TYPES: Record<string, string> = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac',
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/flac': 'flac', 'audio/x-flac': 'flac', 'audio/ogg': 'ogg',
};
export const VISUAL_TYPES: Record<string, string> = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };

export const initialState = (): PartyState => ({ status: 'lobby', track: -1, pos: 0, at: 0 });

/** Where the current track is, in ms, at room time `t`. */
export const positionAt = (s: PartyState, t: number) => (s.status === 'playing' ? s.pos + Math.max(0, t - s.at) : s.pos);

/** When the current track will finish (room time), or null when nothing is playing. */
export function trackEndsAt(s: PartyState, durations: number[]): number | null {
  if (s.status !== 'playing') return null;
  const d = durations[s.track];
  return d == null ? null : s.at + Math.max(0, d - s.pos);
}

/** Rolls the state forward past any tracks that have finished by `t`. The party ends after the last one. */
export function settle(s: PartyState, durations: number[], t: number): PartyState {
  let cur = s;
  for (let i = 0; i < durations.length + 1; i++) {
    const end = trackEndsAt(cur, durations);
    if (end == null || end > t) return cur;
    cur = cur.track + 1 < durations.length
      ? { status: 'playing', track: cur.track + 1, pos: 0, at: end }
      : { status: 'ended', track: cur.track, pos: durations[cur.track] ?? 0, at: end };
  }
  return cur;
}

export type HostAction = 'start' | 'pause' | 'resume' | 'next' | 'end';

/** Applies a host control. Returns the same object when the action doesn't apply. */
export function apply(s: PartyState, action: HostAction, durations: number[], t: number): PartyState {
  const cur = settle(s, durations, t);
  if (cur.status === 'ended') return cur;
  switch (action) {
    case 'start': return cur.status === 'lobby' && durations.length ? { status: 'playing', track: 0, pos: 0, at: t } : cur;
    case 'pause': return cur.status === 'playing' ? { status: 'paused', track: cur.track, pos: positionAt(cur, t), at: t } : cur;
    case 'resume': return cur.status === 'paused' ? { status: 'playing', track: cur.track, pos: cur.pos, at: t } : cur;
    case 'next':
      if (cur.status === 'lobby') return cur;
      return cur.track + 1 < durations.length
        ? { status: cur.status, track: cur.track + 1, pos: 0, at: t }
        : { status: 'ended', track: cur.track, pos: positionAt(cur, t), at: t };
    case 'end': return { status: 'ended', track: Math.max(0, cur.track), pos: positionAt(cur, t), at: t };
  }
}

/**
 * Room clock minus this device's clock, from a few round trips. The fastest round trip is the most
 * trustworthy, because its reply spent the least time on the way.
 */
export function clockOffset(samples: { sent: number; server: number; received: number }[]): number {
  let best: { rtt: number; offset: number } | null = null;
  for (const s of samples) {
    const rtt = s.received - s.sent;
    if (rtt < 0) continue;
    const offset = s.server - (s.sent + rtt / 2);
    if (!best || rtt < best.rtt) best = { rtt, offset };
  }
  return best ? best.offset : 0;
}

/**
 * What the player should do about being `drift` ms away from the room (positive = behind).
 * Small drift is closed by playing a touch faster or slower, which nobody hears; a big one jumps.
 */
export function correction(drift: number): { seek: boolean; rate: number } {
  const a = Math.abs(drift);
  if (a > 1200) return { seek: true, rate: 1 };
  if (a > 90) return { seek: false, rate: drift > 0 ? 1.04 : 0.96 };
  return { seek: false, rate: 1 };
}

export const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** "Live now", "Starts in 12 min", "Tonight 8:00 PM" style label for lists. `when` is the already formatted date. */
export function startsLabel(startsAt: number, live: boolean, t: number, when: string): string {
  if (live) return 'Live now';
  const d = startsAt - t;
  if (d <= 0) return 'Starting any minute';
  if (d < 3_600_000) { const m = Math.max(1, Math.round(d / 60_000)); return `Starts in ${m} min`; }
  if (d < SOON_MS) { const h = Math.round(d / 3_600_000); return `Starts in ${h} hour${h === 1 ? '' : 's'}`; }
  return when;
}
