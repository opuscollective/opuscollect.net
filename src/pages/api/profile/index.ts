import type { APIRoute } from 'astro';
import { getMyProfile, missingForPublish, saveProfile } from '@/server/profiles';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

/** GET: the signed-in member's own profile (including drafts). */
export const GET: APIRoute = async ({ locals }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const profile = await getMyProfile(locals.runtime.env.DB, locals.user.id);
    return json({ profile, missing: profile ? missingForPublish(profile, locals.user.emailVerified) : null, emailVerified: locals.user.emailVerified });
  } catch (e) { return fail(e); }
};

/** POST: save (and optionally publish or unpublish) the member's profile. */
export const POST: APIRoute = async ({ locals, request }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    return json(await saveProfile(locals.runtime.env, locals.user, await readJson(request)));
  } catch (e) { return fail(e); }
};
