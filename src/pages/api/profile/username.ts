import type { APIRoute } from 'astro';
import { checkUsername } from '@/server/usernames';
import { limit } from '@/server/ratelimit';
import { HttpError, fail, json } from '@/server/util';

export const prerender = false;

/** GET /api/profile/username?u=bogo → { ok, username, reason? }. Signed-in members only (it reveals who exists). */
export const GET: APIRoute = async ({ locals, url }) => {
  try {
    const user = locals.user;
    if (!user) throw new HttpError(401, 'Please sign in first.');
    const db = locals.runtime.env.DB;
    await limit(db, `username-check:${user.id}`, 120, 10 * 60_000);
    const mine = await db.prepare("SELECT id FROM profiles WHERE owner_user_id = ? AND kind = 'musician'").bind(user.id).first<{ id: string }>();
    return json(await checkUsername(db, (url.searchParams.get('u') ?? '').slice(0, 60), mine?.id ?? null));
  } catch (e) { return fail(e); }
};
