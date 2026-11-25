import type { APIRoute } from 'astro';
import { limit } from '@/server/ratelimit';
import { HttpError, fail, json } from '@/server/util';
import { searchArtists } from '@/server/works-lookup';

export const prerender = false;

/** GET /api/socials/apple?q=: Apple Music artist pages by name, from Apple's public catalog. Signed-in members only. */
export const GET: APIRoute = async ({ locals, url }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    await limit(locals.runtime.env.DB, `works-find:${locals.user.id}`, 120, 10 * 60_000);
    return json({ results: await searchArtists(url.searchParams.get('q') ?? '') });
  } catch (e) { return fail(e); }
};
