import type { APIRoute } from 'astro';
import { invitePerformer, removePerformer, respondToInvite } from '@/server/events';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

/**
 * POST { handle }: the organizer invites an artist. POST { remove: profileId }: the organizer removes one.
 * POST { respond: 'accept' | 'decline' }: the invited artist answers. Only accepted artists show as performing.
 */
export const POST: APIRoute = async ({ locals, request, params }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const body = await readJson(request);
    const env = locals.runtime.env, id = params.id ?? '';
    if (body.respond) { await respondToInvite(env, locals.user, id, body.respond); return json({ ok: true }); }
    if (body.remove) { await removePerformer(env, locals.user, id, body.remove); return json({ ok: true }); }
    return json(await invitePerformer(env, locals.user, id, body.handle));
  } catch (e) { return fail(e); }
};
