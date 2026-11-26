/**
 * A member's Feed on their profile: what they have been doing on Opus, newest first.
 * Every item is read from rows that already exist (works, confirmed credits, groups, listening parties, events).
 * Nothing is written and nothing is invented; a source whose table is missing is simply skipped.
 */
import { RELEASE_KINDS, roleLabel, type ReleaseKind } from '@/data/music';
import { mediaUrl } from '@/server/profiles';

export type FeedKind = 'work' | 'credit' | 'group' | 'party' | 'event';
export interface FeedItem {
  kind: FeedKind;
  /** Short label above the title: "New single", "Credit", "Joined", "Listening party", "Event". */
  label: string;
  title: string;
  /** One quiet line under the title (role, group type, venue). May be empty. */
  sub: string;
  href: string;
  image: string | null;
  /** Square artwork (covers) or a round picture (a group's photo). */
  round: boolean;
  at: number;
  /** Still ahead of now (a party or event that hasn't happened). */
  upcoming: boolean;
}

const safe = async <T>(run: () => Promise<T[]>): Promise<T[]> => { try { return await run(); } catch { return []; } };

export async function profileFeed(db: D1Database, userId: string, profileId: string, limit = 8, t = Date.now()): Promise<FeedItem[]> {
  const [works, credits, groups, parties, events] = await Promise.all([
    safe(async () => (await db.prepare(
      `SELECT id, title, kind, cover_key, coalesce(published_at, created_at) AS at FROM releases
       WHERE owner_user_id = ? AND status = 'published' ORDER BY at DESC LIMIT ?`).bind(userId, limit)
      .all<{ id: string; title: string; kind: ReleaseKind; cover_key: string | null; at: number }>()).results),
    safe(async () => (await db.prepare(
      `SELECT r.id, r.title, r.cover_key, group_concat(DISTINCT c.role) AS roles, max(coalesce(c.responded_at, c.created_at)) AS at
       FROM release_credits c JOIN releases r ON r.id = c.release_id
       WHERE c.user_id = ? AND c.status = 'confirmed' AND r.status = 'published' AND r.owner_user_id != ?
       GROUP BY r.id ORDER BY at DESC LIMIT ?`).bind(userId, userId, limit)
      .all<{ id: string; title: string; cover_key: string | null; roles: string | null; at: number }>()).results),
    safe(async () => (await db.prepare(
      `SELECT p.handle, p.display_name, p.photo_key, coalesce(m.responded_at, m.created_at) AS at
       FROM clan_members m JOIN profiles p ON p.id = m.clan_id
       WHERE m.user_id = ? AND m.status = 'active' AND p.status = 'published' ORDER BY at DESC LIMIT ?`).bind(userId, limit)
      .all<{ handle: string; display_name: string; photo_key: string | null; at: number }>()).results),
    safe(async () => (await db.prepare(
      `SELECT pa.id, pa.starts_at, pa.status, r.title, r.cover_key FROM parties pa JOIN releases r ON r.id = pa.release_id
       WHERE pa.host_user_id = ? AND pa.status != 'canceled' AND r.status = 'published' ORDER BY pa.starts_at DESC LIMIT ?`).bind(userId, limit)
      .all<{ id: string; starts_at: number; status: string; title: string; cover_key: string | null }>()).results),
    safe(async () => (await db.prepare(
      `SELECT e.id, e.title, e.venue, e.start_at, e.image_key, (e.organizer_profile_id = ?) AS hosting FROM events e
       WHERE e.visibility = 'public' AND e.status = 'scheduled'
         AND (e.organizer_profile_id = ? OR EXISTS (SELECT 1 FROM event_performers x WHERE x.event_id = e.id AND x.profile_id = ? AND x.status = 'confirmed'))
       ORDER BY e.start_at DESC LIMIT ?`).bind(profileId, profileId, profileId, limit)
      .all<{ id: string; title: string; venue: string; start_at: number; image_key: string | null; hosting: number }>()).results),
  ]);

  const items: FeedItem[] = [
    ...works.map((w): FeedItem => ({ kind: 'work', label: 'New ' + (w.kind === 'ep' ? 'EP' : (RELEASE_KINDS[w.kind] ?? 'work').toLowerCase()), title: w.title, sub: '', href: `/r/${w.id}`, image: mediaUrl(w.cover_key), round: false, at: w.at, upcoming: false })),
    ...credits.map((c): FeedItem => ({ kind: 'credit', label: 'Credit', title: c.title, sub: (c.roles ? c.roles.split(',') : []).map(roleLabel).slice(0, 2).join(', '), href: `/r/${c.id}`, image: mediaUrl(c.cover_key), round: false, at: c.at, upcoming: false })),
    ...groups.map((g): FeedItem => ({ kind: 'group', label: 'Joined', title: g.display_name, sub: 'Group', href: `/c/${g.handle}`, image: mediaUrl(g.photo_key), round: true, at: g.at, upcoming: false })),
    ...parties.map((p): FeedItem => ({ kind: 'party', label: p.status === 'live' ? 'Live now' : 'Listening party', title: p.title, sub: p.status === 'live' ? 'Listening party' : '', href: `/party/${p.id}`, image: mediaUrl(p.cover_key), round: false, at: p.starts_at, upcoming: p.status === 'scheduled' && p.starts_at > t })),
    ...events.map((e): FeedItem => ({ kind: 'event', label: e.hosting ? 'Hosting' : 'Performing', title: e.title, sub: e.venue, href: `/events/${e.id}`, image: mediaUrl(e.image_key), round: false, at: e.start_at, upcoming: e.start_at > t })),
  ];
  // What is coming up leads (soonest first), then everything that happened, newest first.
  const ahead = items.filter((i) => i.upcoming).sort((a, b) => a.at - b.at);
  const past = items.filter((i) => !i.upcoming).sort((a, b) => b.at - a.at);
  return [...ahead, ...past].slice(0, limit);
}

/** "Today", "3d", "2w", or a short date; upcoming items read "Dec 4". */
export function feedWhen(at: number, upcoming: boolean, t = Date.now()): string {
  const date = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts }).format(at);
  if (upcoming) return date({ month: 'short', day: 'numeric' });
  const d = Math.floor((t - at) / 86_400_000);
  if (d < 1) return 'Today';
  if (d < 7) return d + 'd';
  if (d < 35) return Math.floor(d / 7) + 'w';
  return date(d < 330 ? { month: 'short', day: 'numeric' } : { month: 'short', year: 'numeric' });
}
