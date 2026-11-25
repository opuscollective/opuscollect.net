/**
 * Columns that newer migrations add, checked once per Worker instance, so the site keeps working on a database
 * the migration hasn't reached yet (previews and production get migrations only with Bogo's approval).
 */
let inWorld: Promise<boolean> | null = null;

/** Whether profiles.in_world exists (migration 0017: the "Show me in World" setting). */
export function hasInWorld(db: D1Database): Promise<boolean> {
  inWorld ??= db.prepare('PRAGMA table_info(profiles)').all<{ name: string }>()
    .then((r) => r.results.some((c) => c.name === 'in_world'))
    .catch(() => false);
  return inWorld;
}
