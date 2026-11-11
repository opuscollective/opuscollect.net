import type { APIRoute } from 'astro';
import { getMyProfile } from '@/server/profiles';
import { deleteRelease, updateRelease } from '@/server/releases';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

async function myProfile(locals: App.Locals) {
  if (!locals.user) throw new HttpError(401, 'Please sign in first.');
  const p = await getMyProfile(locals.runtime.env.DB, locals.user.id);
  if (!p) throw new HttpError(409, 'Set up your profile first.');
  return p;
}

/** PATCH: change a release (any subset of fields). */
export const PATCH: APIRoute = async ({ locals, request, params }) => {
  try {
    const p = await myProfile(locals);
    return json({ release: await updateRelease(locals.runtime.env.DB, locals.user!.id, p.id, String(params.id), await readJson(request)) });
  } catch (e) { return fail(e); }
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  try {
    const p = await myProfile(locals);
    await deleteRelease(locals.runtime.env.DB, p.id, String(params.id));
    return json({ ok: true });
  } catch (e) { return fail(e); }
};
