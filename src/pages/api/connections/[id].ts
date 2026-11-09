import type { APIRoute } from 'astro';
import { actOnConnection, block } from '@/server/connections';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

/**
 * POST /api/connections/{id} { action: accept | decline | withdraw | remove }
 * POST /api/connections/block { handle, on: true|false }
 */
export const POST: APIRoute = async ({ locals, request, params }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const body = await readJson<{ action?: unknown; handle?: unknown; on?: unknown }>(request);
    if (params.id === 'block') {
      await block(locals.runtime.env, locals.user, body.handle, body.on !== false);
      return json({ ok: true });
    }
    await actOnConnection(locals.runtime.env, locals.user, params.id ?? '', body.action);
    return json({ ok: true });
  } catch (e) { return fail(e); }
};
