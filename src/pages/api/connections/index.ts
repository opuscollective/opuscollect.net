import type { APIRoute } from 'astro';
import { listConnections, requestConnection } from '@/server/connections';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    return json(await listConnections(locals.runtime.env.DB, locals.user.id));
  } catch (e) { return fail(e); }
};

/** POST { to: handle, message } sends a connection request. */
export const POST: APIRoute = async ({ locals, request }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    return json(await requestConnection(locals.runtime.env, locals.user, await readJson(request)));
  } catch (e) { return fail(e); }
};
