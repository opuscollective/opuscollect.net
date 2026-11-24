import type { APIRoute } from 'astro';
import { removePartyVisual, removeTrack, servePartyMedia, uploadPartyMedia } from '@/server/parties';
import { HttpError, fail, json } from '@/server/util';

export const prerender = false;

const kindOf = (url: URL) => (url.searchParams.get('kind') === 'visual' ? 'visual' : 'audio');

/**
 * A party track's private file.
 * GET ?kind=audio|visual   plays it: members only, only while the party is live (the host any time).
 * PUT ?kind=audio|visual   the host uploads it; the request body is the file.
 * DELETE ?kind=visual      removes the video. DELETE with no kind removes the track from the party.
 */
export const GET: APIRoute = async ({ locals, params, request, url }) =>
  servePartyMedia(locals.runtime.env, locals.user, params.id ?? '', params.track ?? '', kindOf(url), request);

export const PUT: APIRoute = async ({ locals, params, request, url }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    return json(await uploadPartyMedia(locals.runtime.env, locals.user, params.id ?? '', params.track ?? '', kindOf(url), request));
  } catch (e) { return fail(e); }
};

export const DELETE: APIRoute = async ({ locals, params, url }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const env = locals.runtime.env;
    return json(url.searchParams.get('kind') === 'visual'
      ? await removePartyVisual(env, locals.user, params.id ?? '', params.track ?? '')
      : await removeTrack(env, locals.user, params.id ?? '', params.track ?? ''));
  } catch (e) { return fail(e); }
};
