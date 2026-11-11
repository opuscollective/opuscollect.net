import type { APIRoute } from 'astro';
import { respondToCredit } from '@/server/releases';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

/** POST { action: confirm | decline } — the credited member answers a credit (decline also removes it from their profile later). */
export const POST: APIRoute = async ({ locals, request, params }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const body = await readJson<{ action?: unknown }>(request);
    await respondToCredit(locals.runtime.env, locals.user, params.id ?? '', body.action);
    return json({ ok: true });
  } catch (e) { return fail(e); }
};
