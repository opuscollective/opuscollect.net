import type { APIRoute } from 'astro';
import { addCredit, removeCredit } from '@/server/releases';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

/**
 * POST { role, trackId?, handle?, name?, note? } adds a credit. With a member handle, they get a request to confirm.
 * POST { remove: creditId } removes one (owner only).
 */
export const POST: APIRoute = async ({ locals, request, params, url }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const body = await readJson<Record<string, unknown>>(request);
    const id = params.id ?? '';
    if (body.remove) { await removeCredit(locals.runtime.env, locals.user, id, body.remove); return json({ ok: true }); }
    return json(await addCredit(locals.runtime.env, locals.user, id, body, url.origin));
  } catch (e) { return fail(e); }
};
