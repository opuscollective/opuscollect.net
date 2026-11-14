import type { APIRoute } from 'astro';
import { mediaUrl, removeImage, uploadImage } from '@/server/profiles';
import { HttpError, fail, json } from '@/server/util';

export const prerender = false;

const slotOf = (url: URL) => {
  const s = url.searchParams.get('slot');
  if (s !== 'photo' && s !== 'cover' && s !== 'work') throw new HttpError(400, 'Unknown image slot.');
  return s;
};

/** POST /api/profile/image?slot=photo|cover|work (work = artwork for a Featured Work item, attached on save) with the image bytes as the body (JPEG or WebP, max 5 MB). */
export const POST: APIRoute = async ({ locals, request, url }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const key = await uploadImage(locals.runtime.env, locals.user, request, slotOf(url));
    return json({ ok: true, url: mediaUrl(key), key });
  } catch (e) { return fail(e); }
};

export const DELETE: APIRoute = async ({ locals, url }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const slot = slotOf(url);
    if (slot === 'work') throw new HttpError(400, 'Remove the featured item instead.');
    await removeImage(locals.runtime.env, locals.user, slot);
    return json({ ok: true });
  } catch (e) { return fail(e); }
};
