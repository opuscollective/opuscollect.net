import type { APIRoute } from 'astro';
import { followCity, unfollowCity } from '@/server/cities';
import { HttpError, fail, json } from '@/server/util';

export const prerender = false;

/** PUT: follow a city (idempotent). DELETE: unfollow. Only for the signed-in member, about themselves. */
export const PUT: APIRoute = async ({ locals, params }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Sign in to follow cities.');
    return json({ following: true, city: await followCity(locals.runtime.env, locals.user, params.id ?? '') });
  } catch (e) { return fail(e); }
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    await unfollowCity(locals.runtime.env, locals.user, params.id ?? '');
    return json({ following: false });
  } catch (e) { return fail(e); }
};
