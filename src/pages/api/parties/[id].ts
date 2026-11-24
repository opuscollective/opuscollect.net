import type { APIRoute } from 'astro';
import { cancelParty, updateParty } from '@/server/parties';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

/** PATCH: change the time, note, pin and track notes. DELETE: cancel the party and delete its files. Host only. */
export const PATCH: APIRoute = async ({ locals, request, params }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    return json(await updateParty(locals.runtime.env, locals.user, params.id ?? '', await readJson(request)));
  } catch (e) { return fail(e); }
};

/** The shared form helper posts; same as PATCH. */
export const POST = PATCH;

export const DELETE: APIRoute = async ({ locals, params }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    return json(await cancelParty(locals.runtime.env, locals.user, params.id ?? ''));
  } catch (e) { return fail(e); }
};
