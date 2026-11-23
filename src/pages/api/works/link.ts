import type { APIRoute } from 'astro';
import { limit } from '@/server/ratelimit';
import { HttpError, fail, json } from '@/server/util';
import { lookupLink } from '@/server/works-lookup';

export const prerender = false;

/** GET /api/works/link?url=: details for a pasted streaming link (song.link). Signed-in members only. */
export const GET: APIRoute = async ({ locals, url }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    await limit(locals.runtime.env.DB, `works-link:${locals.user.id}`, 40, 10 * 60_000);
    return json({ result: await lookupLink(url.searchParams.get('url') ?? '') });
  } catch (e) { return fail(e); }
};
