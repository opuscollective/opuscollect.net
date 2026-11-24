/**
 * Reads a member's real activity for levels and achievements (see src/lib/progress.ts).
 * Every number is a count of rows that already exist; nothing is stored, so there is no migration
 * and nothing to fall out of date. Each query fails soft: a missing table counts as zero.
 */
import { NO_STATS, type Stats } from '@/lib/progress';
import { PLACE_BY_ID } from '@/data/places';

const one = async (db: D1Database, sql: string, ...binds: unknown[]): Promise<Record<string, number>> => {
  try { return (await db.prepare(sql).bind(...binds).first<Record<string, number>>()) ?? {}; } catch { return {}; }
};

export interface MetroCount { metro: string; country: string; n: number }

/** Accepted connections grouped by the metro area each connection's own published profile is in. */
export async function connectionMetros(db: D1Database, userId: string): Promise<MetroCount[]> {
  try {
    const { results } = await db.prepare(
      `SELECT coalesce(pl.metro_id, pl.id) AS metro, pl.country AS country, COUNT(*) AS n
       FROM (SELECT CASE WHEN requester_id = ?1 THEN addressee_id ELSE requester_id END AS other
             FROM connections WHERE status = 'accepted' AND (requester_id = ?1 OR addressee_id = ?1)) x
       JOIN profiles p ON p.owner_user_id = x.other AND p.kind = 'musician' AND p.status = 'published'
       JOIN places pl ON pl.id = p.place_id
       GROUP BY 1, 2 ORDER BY n DESC`).bind(userId).all<MetroCount>();
    return results;
  } catch { return []; }
}

export const homeMetroOf = (placeId: string | null) => (placeId ? PLACE_BY_ID.get(placeId)?.metroId ?? placeId : null);

export async function memberStats(
  db: D1Database, userId: string,
  profile: { status: string; photoKey: string | null; verification: string; placeId: string | null },
  metros?: MetroCount[],
): Promise<Stats> {
  const home = homeMetroOf(profile.placeId);
  const [works, earned, given, conn, groups, parties, away, cityRows] = await Promise.all([
    one(db, "SELECT COUNT(*) AS n FROM releases WHERE owner_user_id = ? AND status = 'published'", userId),
    // Confirmed by the member on someone else's published work: one per work, however many roles.
    one(db, `SELECT COUNT(DISTINCT c.release_id) AS n FROM release_credits c JOIN releases r ON r.id = c.release_id
             WHERE c.user_id = ? AND c.status = 'confirmed' AND r.status = 'published' AND r.owner_user_id <> ?`, userId, userId),
    // Other members who confirmed a credit on this member's published works.
    one(db, `SELECT COUNT(DISTINCT c.user_id) AS n FROM release_credits c JOIN releases r ON r.id = c.release_id
             WHERE r.owner_user_id = ? AND r.status = 'published' AND c.status = 'confirmed' AND c.user_id IS NOT NULL AND c.user_id <> ?`, userId, userId),
    one(db, "SELECT COUNT(*) AS n FROM connections WHERE status = 'accepted' AND (requester_id = ?1 OR addressee_id = ?1)", userId),
    one(db, "SELECT COUNT(DISTINCT clan_id) AS n FROM clan_members WHERE user_id = ? AND status = 'active'", userId),
    // A party counts once it actually ran with someone else in the room.
    one(db, "SELECT COUNT(*) AS n, coalesce(MAX(peak_listeners), 0) AS peak FROM parties WHERE host_user_id = ? AND status = 'ended' AND started_at IS NOT NULL AND peak_listeners >= 2", userId),
    // The same, pinned to a city that isn't home. Only counted when the member has a home city.
    home ? one(db, "SELECT COUNT(*) AS n FROM parties WHERE host_user_id = ? AND status = 'ended' AND started_at IS NOT NULL AND peak_listeners >= 2 AND place_id IS NOT NULL AND place_id <> ?", userId, home) : Promise.resolve({} as Record<string, number>),
    metros ? Promise.resolve(metros) : connectionMetros(db, userId),
  ]);
  return {
    ...NO_STATS,
    works: works.n ?? 0, creditsEarned: earned.n ?? 0, creditsGiven: given.n ?? 0,
    connections: conn.n ?? 0, connectionCities: cityRows.length, connectionCountries: new Set(cityRows.map((r) => r.country)).size,
    // Away from home needs a home: without a profile city nothing counts as away.
    awayConnections: home ? cityRows.filter((r) => r.metro !== home).reduce((a, r) => a + r.n, 0) : 0,
    awayParties: away.n ?? 0,
    groups: groups.n ?? 0, partiesHosted: parties.n ?? 0, partyPeak: parties.peak ?? 0,
    published: profile.status === 'published', hasPhoto: !!profile.photoKey, verified: profile.verification === 'verified',
  };
}
