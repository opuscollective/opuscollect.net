import type { APIRoute } from 'astro';
import { claimSpot, respondInvite } from '@/server/clans';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

/**
 * The invited person's side. POST { spotId, action: 'accept' | 'decline' } answers an invitation sent to this account.
 * POST { token, action } answers an invite link (a roster spot for someone new).
 */
export const POST: APIRoute = async ({ locals, request }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const b = await readJson(request);
    const env = locals.runtime.env;
    return json(b.token ? await claimSpot(env, locals.user, b.token, b.action) : await respondInvite(env, locals.user, b.spotId, b.action));
  } catch (e) { return fail(e); }
};
