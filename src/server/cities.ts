/**
 * Following cities on World. A follow is a member's interest in a city, nothing more: it never changes their
 * profile location and is never shown to anyone else (no follower counts). city_id is a metro id from
 * src/data/places.ts, so events (events.place_id) and future city updates join on the same key.
 */
import { PLACE_BY_ID, type Place } from '@/data/places';
import { citySlug } from '@/data/cities';
import type { SessionUser } from './session';
import { HttpError, now } from './util';

export interface FollowedCity { id: string; name: string; region?: string; countryName: string; slug: string; followedAt: number }

/** Only metros can be followed: they are the cities World has guides for. */
export function cityPlace(id: string): Place {
  const p = PLACE_BY_ID.get(id);
  if (!p || p.kind !== 'metro') throw new HttpError(404, 'We don’t know that city.');
  return p;
}

const view = (p: Place, followedAt: number): FollowedCity => ({ id: p.id, name: p.name, region: p.region, countryName: p.countryName, slug: citySlug(p.name), followedAt });

export async function listFollows(env: Env, userId: string): Promise<FollowedCity[]> {
  const { results } = await env.DB.prepare('SELECT city_id, created_at FROM city_follows WHERE user_id = ? ORDER BY created_at DESC')
    .bind(userId).all<{ city_id: string; created_at: number }>();
  return results.flatMap((r) => { const p = PLACE_BY_ID.get(r.city_id); return p && p.kind === 'metro' ? [view(p, r.created_at)] : []; });
}

/** Metro ids the member follows (for personalising events). */
export async function followedIds(env: Env, userId: string): Promise<string[]> {
  return (await listFollows(env, userId)).map((c) => c.id);
}

/** Following twice is a no-op (the primary key keeps one row). */
export async function followCity(env: Env, user: SessionUser, id: string): Promise<FollowedCity> {
  const p = cityPlace(id);
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM city_follows WHERE user_id = ?').bind(user.id).first<{ n: number }>();
  if ((n?.n ?? 0) >= 100) throw new HttpError(400, 'You can follow up to 100 cities.');
  const at = now();
  await env.DB.prepare('INSERT INTO city_follows (user_id, city_id, created_at) VALUES (?, ?, ?) ON CONFLICT (user_id, city_id) DO NOTHING')
    .bind(user.id, p.id, at).run();
  const row = await env.DB.prepare('SELECT created_at FROM city_follows WHERE user_id = ? AND city_id = ?').bind(user.id, p.id).first<{ created_at: number }>();
  return view(p, row?.created_at ?? at);
}

export async function unfollowCity(env: Env, user: SessionUser, id: string): Promise<void> {
  const p = cityPlace(id);
  await env.DB.prepare('DELETE FROM city_follows WHERE user_id = ? AND city_id = ?').bind(user.id, p.id).run();
}
