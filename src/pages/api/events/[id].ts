import type { APIRoute } from 'astro';
import { cancelEvent, updateEvent } from '@/server/events';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

/** PATCH (or POST without action): edit. POST { action: 'cancel' }: cancel. Organizer only. */
export const PATCH: APIRoute = async ({ locals, request, params }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    return json(await updateEvent(locals.runtime.env, locals.user, params.id ?? '', await readJson(request)));
  } catch (e) { return fail(e); }
};

export const POST: APIRoute = async ({ locals, request, params }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const body = await readJson(request);
    if (body.action !== 'cancel') return json(await updateEvent(locals.runtime.env, locals.user, params.id ?? '', body));
    await cancelEvent(locals.runtime.env, locals.user, params.id ?? '');
    return json({ ok: true });
  } catch (e) { return fail(e); }
};
