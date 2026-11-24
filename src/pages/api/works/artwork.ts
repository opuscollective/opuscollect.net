import type { APIRoute } from 'astro';
import { HttpError, fail } from '@/server/util';
import { fetchArtwork } from '@/server/works-lookup';

export const prerender = false;

/** GET /api/works/artwork?url=: relays cover art from an allowed host so the browser can re-encode and upload it. */
export const GET: APIRoute = async ({ locals, url }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const { body, type } = await fetchArtwork(url.searchParams.get('url') ?? '');
    return new Response(body, { headers: { 'content-type': type, 'cache-control': 'private, max-age=600' } });
  } catch (e) { return fail(e); }
};
