/**
 * Reads a member's real activity for levels and achievements (see src/lib/progress.ts).
 * Every number is a count of rows that already exist; nothing is stored, so there is no migration
 * and nothing to fall out of date. Each query fails soft: a missing table counts as zero.
 */
import { NO_STATS, type Stats } from '@/lib/progress';

const one = async (db: D1Database, sql: string, ...binds: unknown[]): Promise<Record<string, number>> => {
  try { return (await db.prepare(sql).bind(...binds).first<Record<string, number>>()) ?? {}; } catch { return {}; }
};

export async function memberStats(db: D1Database, userId: string, profile: { status: string; photoKey: string | null; verification: string }): Promise<Stats> {
  const [works, earned, given, conn, groups, parties] = await Promise.all([
    one(db, "SELECT COUNT(*) AS n FROM releases WHERE owner_user_id = ? AND status = 'published'", userId),
    // Confirmed by the member on someone else's published work: one per work, however many roles.
    one(db, `SELECT COUNT(DISTINCT c.release_id) AS n FROM release_credits c JOIN releases r ON r.id = c.release_id
             WHERE c.user_id = ? AND c.status = 'confirmed' AND r.status = 'published' AND r.owner_user_id <> ?`, userId, userId),
    // Other members who confirmed a credit on this member's published works.
    one(db, `SELECT COUNT(DISTINCT c.user_id) AS n FROM release_credits c JOIN releases r ON r.id = c.release_id
             WHERE r.owner_user_id = ? AND r.status = 'published' AND c.status = 'confirmed' AND c.user_id IS NOT NULL AND c.user_id <> ?`, userId, userId),
    // Accepted connections, and how many metro areas and countries they span (from each connection's own profile).
    one(db, `SELECT COUNT(*) AS n, COUNT(DISTINCT coalesce(pl.metro_id, pl.id)) AS cities, COUNT(DISTINCT pl.country) AS countries
             FROM (SELECT CASE WHEN requester_id = ?1 THEN addressee_id ELSE requester_id END AS other
                   FROM connections WHERE status = 'accepted' AND (requester_id = ?1 OR addressee_id = ?1)) x
             LEFT JOIN profiles p ON p.owner_user_id = x.other AND p.kind = 'musician' AND p.status = 'published'
             LEFT JOIN places pl ON pl.id = p.place_id`, userId),
    one(db, "SELECT COUNT(DISTINCT clan_id) AS n FROM clan_members WHERE user_id = ? AND status = 'active'", userId),
    // A party counts once it actually ran with someone else in the room.
    one(db, "SELECT COUNT(*) AS n, coalesce(MAX(peak_listeners), 0) AS peak FROM parties WHERE host_user_id = ? AND status = 'ended' AND started_at IS NOT NULL AND peak_listeners >= 2", userId),
  ]);
  return {
    ...NO_STATS,
    works: works.n ?? 0, creditsEarned: earned.n ?? 0, creditsGiven: given.n ?? 0,
    connections: conn.n ?? 0, connectionCities: conn.cities ?? 0, connectionCountries: conn.countries ?? 0,
    groups: groups.n ?? 0, partiesHosted: parties.n ?? 0, partyPeak: parties.peak ?? 0,
    published: profile.status === 'published', hasPhoto: !!profile.photoKey, verified: profile.verification === 'verified',
  };
}
