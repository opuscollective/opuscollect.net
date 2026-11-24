import type { APIRoute } from 'astro';
import { createParty, listPublicParties } from '@/server/parties';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

/** GET: live parties and the ones coming up (World). POST: schedule a party for one of your works. */
export const GET: APIRoute = async ({ locals }) => {
  try {
    return json({ parties: await listPublicParties(locals.runtime.env) }, { headers: { 'cache-control': 'public, max-age=20' } });
  } catch (e) { return fail(e); }
};

export const POST: APIRoute = async ({ locals, request }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    return json(await createParty(locals.runtime.env, locals.user, await readJson(request)));
  } catch (e) { return fail(e); }
};
