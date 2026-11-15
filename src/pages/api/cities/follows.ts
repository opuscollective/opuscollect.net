import type { APIRoute } from 'astro';
import { listFollows } from '@/server/cities';
import { fail, json } from '@/server/util';

export const prerender = false;

/** GET: the cities the signed-in member follows. Signed out: an empty list, so pages can show "Follow City". */
export const GET: APIRoute = async ({ locals }) => {
  try {
    if (!locals.user) return json({ signedIn: false, cities: [] });
    return json({ signedIn: true, cities: await listFollows(locals.runtime.env, locals.user.id) });
  } catch (e) { return fail(e); }
};
