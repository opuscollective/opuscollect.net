import type { APIRoute } from 'astro';
import { createClan } from '@/server/clans';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

/** POST { name, groupType, placeId, bio, myRoles }: create a group. Signed in, email confirmed, profile set up. */
export const POST: APIRoute = async ({ locals, request }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    return json(await createClan(locals.runtime.env, locals.user, await readJson(request)));
  } catch (e) { return fail(e); }
};
