import type { APIRoute } from 'astro';
import { chatIdentity, room } from '@/server/chat';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

/**
 * POST /api/chat/messages { body, cid }: send without a socket. It goes through the same room,
 * so the cooldown and rules are identical to a socket send.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Join Opus to say something to the world.');
    const env = locals.runtime.env;
    const id = await chatIdentity(env.DB, locals.user.id);
    if (!id) throw new HttpError(401, 'Please sign in first.');
    const body = await readJson<{ body?: unknown; cid?: unknown }>(request, 8_000);
    const res = await room(env).fetch('https://room/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-opus-identity': encodeURIComponent(JSON.stringify(id)) },
      body: JSON.stringify({ body: body.body, cid: typeof body.cid === 'string' ? body.cid.slice(0, 40) : null }),
    });
    const r = await res.json<{ ok: boolean; code?: string; error?: string; retryAfter?: number }>();
    if (r.ok) return json(r);
    const status = r.code === 'cooldown' || r.code === 'burst' ? 429 : r.code === 'server' ? 500 : 403;
    return json(r, { status, headers: r.retryAfter ? { 'retry-after': String(r.retryAfter) } : {} });
  } catch (e) { return fail(e); }
};
