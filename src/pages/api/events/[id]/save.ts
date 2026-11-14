import type { APIRoute } from 'astro';
import { saveEvent, unsaveEvent } from '@/server/events';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

/** PUT { relation: 'saved' | 'interested' | 'going' }: add to My Future or change it. DELETE: remove. Never a ticket or RSVP. */
export const PUT: APIRoute = async ({ locals, request, params }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Sign in to save events to My Future.');
    const body = await readJson(request);
    return json(await saveEvent(locals.runtime.env, locals.user, params.id ?? '', body.relation ?? 'saved'));
  } catch (e) { return fail(e); }
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    await unsaveEvent(locals.runtime.env, locals.user, params.id ?? '');
    return json({ ok: true });
  } catch (e) { return fail(e); }
};
