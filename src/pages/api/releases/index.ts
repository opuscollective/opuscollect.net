import type { APIRoute } from 'astro';
import { getMyProfile } from '@/server/profiles';
import { createRelease, listReleases } from '@/server/releases';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

async function myProfile(locals: App.Locals) {
  if (!locals.user) throw new HttpError(401, 'Please sign in first.');
  const p = await getMyProfile(locals.runtime.env.DB, locals.user.id);
  if (!p) throw new HttpError(409, 'Set up your profile first.');
  return p;
}

/** GET: the signed-in member's releases (including ones hidden from their profile). */
export const GET: APIRoute = async ({ locals }) => {
  try {
    const p = await myProfile(locals);
    return json({ releases: await listReleases(locals.runtime.env.DB, p.id) });
  } catch (e) { return fail(e); }
};

/** POST: start a release or add a past one. */
export const POST: APIRoute = async ({ locals, request }) => {
  try {
    const p = await myProfile(locals);
    return json({ release: await createRelease(locals.runtime.env.DB, locals.user!.id, p.id, await readJson(request)) });
  } catch (e) { return fail(e); }
};
