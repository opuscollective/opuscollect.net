/**
 * What a signed-in visitor has in common with a member: connections they both hold and published works
 * they both appear on. Real rows only; empty when there is no overlap. Never cached publicly.
 */
import { mediaUrl } from './profiles';

export interface Overlap {
  /** The visitor and this member are already connected. */
  connected: boolean;
  mutualCount: number;
  mutuals: { handle: string; name: string; photo: string | null }[];
  works: { id: string; title: string; cover: string | null; year: string }[];
}

export const NO_OVERLAP: Overlap = { connected: false, mutualCount: 0, mutuals: [], works: [] };

export async function overlap(db: D1Database, viewerId: string, ownerId: string): Promise<Overlap> {
  if (!viewerId || !ownerId || viewerId === ownerId) return NO_OVERLAP;
  const both = `WITH mine AS (SELECT CASE WHEN requester_id = ?1 THEN addressee_id ELSE requester_id END AS u FROM connections WHERE (requester_id = ?1 OR addressee_id = ?1) AND status = 'accepted'),
      theirs AS (SELECT CASE WHEN requester_id = ?2 THEN addressee_id ELSE requester_id END AS u FROM connections WHERE (requester_id = ?2 OR addressee_id = ?2) AND status = 'accepted'),
      shared AS (SELECT u FROM mine JOIN theirs USING (u)
        WHERE NOT EXISTS (SELECT 1 FROM blocks k WHERE (k.blocker_id = ?1 AND k.blocked_id = u) OR (k.blocker_id = u AND k.blocked_id = ?1)))`;
  const [link, count, faces, works] = await Promise.all([
    db.prepare("SELECT 1 FROM connections WHERE status = 'accepted' AND ((requester_id = ?1 AND addressee_id = ?2) OR (requester_id = ?2 AND addressee_id = ?1))").bind(viewerId, ownerId).first(),
    db.prepare(`${both} SELECT COUNT(*) AS n FROM shared`).bind(viewerId, ownerId).first<{ n: number }>(),
    db.prepare(`${both} SELECT p.handle, p.display_name, p.photo_key FROM shared s
        JOIN profiles p ON p.owner_user_id = s.u AND p.kind = 'musician' AND p.status = 'published' ORDER BY p.display_name LIMIT 5`)
      .bind(viewerId, ownerId).all<{ handle: string; display_name: string; photo_key: string | null }>(),
    // A work counts for someone when they own it or hold a confirmed credit on it.
    db.prepare(`SELECT r.id, r.title, r.cover_key, r.release_date FROM releases r
      WHERE r.status = 'published'
        AND (r.owner_user_id = ?1 OR EXISTS (SELECT 1 FROM release_credits c WHERE c.release_id = r.id AND c.user_id = ?1 AND c.status = 'confirmed'))
        AND (r.owner_user_id = ?2 OR EXISTS (SELECT 1 FROM release_credits c WHERE c.release_id = r.id AND c.user_id = ?2 AND c.status = 'confirmed'))
      ORDER BY coalesce(r.release_date, '') DESC LIMIT 6`).bind(viewerId, ownerId).all<{ id: string; title: string; cover_key: string | null; release_date: string | null }>(),
  ]);
  return {
    connected: !!link,
    mutualCount: count?.n ?? 0,
    mutuals: faces.results.map((f) => ({ handle: f.handle, name: f.display_name, photo: mediaUrl(f.photo_key) ?? null })),
    works: works.results.map((w) => ({ id: w.id, title: w.title, cover: mediaUrl(w.cover_key) ?? null, year: w.release_date?.slice(0, 4) ?? '' })),
  };
}
