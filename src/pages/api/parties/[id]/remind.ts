import type { APIRoute } from 'astro';
import { setReminder } from '@/server/parties';
import { HttpError, fail, json } from '@/server/util';

export const prerender = false;

/** POST: remind me (adds the party to My Future). DELETE: remove the reminder. */
export const POST: APIRoute = async ({ locals, params }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    return json(await setReminder(locals.runtime.env, locals.user, params.id ?? '', true));
  } catch (e) { return fail(e); }
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    return json(await setReminder(locals.runtime.env, locals.user, params.id ?? '', false));
  } catch (e) { return fail(e); }
};
