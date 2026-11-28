import type { APIRoute } from 'astro';
import { postTrack } from '@/server/feedback';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

/** POST /api/feedback { url, title, artist?, artwork?, ask? }: post a track for feedback. */
export const POST: APIRoute = async ({ locals, request }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    return json(await postTrack(locals.runtime.env.DB, locals.user, await readJson(request, 8_000)));
  } catch (e) { return fail(e); }
};
