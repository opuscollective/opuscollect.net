import type { APIRoute } from 'astro';
import { removeEventImage, uploadEventImage } from '@/server/events';
import { HttpError, fail, json } from '@/server/util';

export const prerender = false;

/** POST the image bytes (JPEG or WebP, max 5 MB, metadata stripped). DELETE removes it. Organizer only. */
export const POST: APIRoute = async ({ locals, request, params }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    return json({ ok: true, url: await uploadEventImage(locals.runtime.env, locals.user, params.id ?? '', request) });
  } catch (e) { return fail(e); }
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    await removeEventImage(locals.runtime.env, locals.user, params.id ?? '');
    return json({ ok: true });
  } catch (e) { return fail(e); }
};
