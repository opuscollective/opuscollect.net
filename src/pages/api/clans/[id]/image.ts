import type { APIRoute } from 'astro';
import { clanImageTarget } from '@/server/clans';
import { mediaUrl, removeImage, uploadImage } from '@/server/profiles';
import { HttpError, fail, json } from '@/server/util';

export const prerender = false;

/** POST the Clan photo (JPEG or WebP bytes, max 5 MB); DELETE removes it. Admins only. */
export const POST: APIRoute = async ({ locals, request, params }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const target = await clanImageTarget(locals.runtime.env.DB, locals.user, params.id);
    const key = await uploadImage(locals.runtime.env, locals.user, request, 'photo', target);
    return json({ ok: true, url: mediaUrl(key) });
  } catch (e) { return fail(e); }
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const target = await clanImageTarget(locals.runtime.env.DB, locals.user, params.id);
    await removeImage(locals.runtime.env, locals.user, 'photo', target);
    return json({ ok: true });
  } catch (e) { return fail(e); }
};
