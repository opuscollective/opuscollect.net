import type { APIRoute } from 'astro';
import { searchPeople } from '@/server/releases';
import { HttpError, fail, json } from '@/server/util';

export const prerender = false;

/** GET ?q=name → up to 8 published members, for the credit picker. Signed-in members only. */
export const GET: APIRoute = async ({ locals, url }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    return json({ people: await searchPeople(locals.runtime.env.DB, locals.user, url.searchParams.get('q') ?? '') });
  } catch (e) { return fail(e); }
};
