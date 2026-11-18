import type { APIRoute } from 'astro';
import { createEvent, listPublicEvents } from '@/server/events';
import { HttpError, fail, json, readJson, str } from '@/server/util';

export const prerender = false;

/** GET ?place=<placeId>: upcoming public events. POST: create an event (signed in, email confirmed, profile set up). */
export const GET: APIRoute = async ({ locals, url }) => {
  try {
    const events = await listPublicEvents(locals.runtime.env.DB, { placeId: str(url.searchParams.get('place'), 80) || undefined });
    return json({ events: events.map(({ imageKey, ...e }) => ({ ...e, organizer: { name: e.organizer.name, handle: e.organizer.handle } })) });
  } catch (e) { return fail(e); }
};

export const POST: APIRoute = async ({ locals, request }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    return json(await createEvent(locals.runtime.env, locals.user, await readJson(request)));
  } catch (e) { return fail(e); }
};
