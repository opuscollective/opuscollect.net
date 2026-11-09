import { HttpError, now } from './util';

/**
 * Fixed-window rate limit backed by D1. Throws a 429 HttpError when the limit is exceeded.
 * Example: await limit(db, `login:ip:${ip}`, 20, 15 * 60_000)
 */
export async function limit(db: D1Database, key: string, max: number, windowMs: number) {
  const start = Math.floor(now() / windowMs) * windowMs;
  const row = await db
    .prepare('INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1) ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1 RETURNING count')
    .bind(key, start)
    .first<{ count: number }>();
  if ((row?.count ?? 0) > max) {
    const mins = Math.max(1, Math.ceil((start + windowMs - now()) / 60_000));
    throw new HttpError(429, `Too many attempts. Please wait ${mins} minute${mins === 1 ? '' : 's'} and try again.`);
  }
  // Housekeeping: occasionally drop old windows.
  if (Math.random() < 0.02) await db.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(now() - 86_400_000).run();
}
