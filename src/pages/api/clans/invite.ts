import type { APIRoute } from 'astro';
import { joinByInvite } from '@/server/clans';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

/** POST { token } — the signed-in person chose to join through a group's invite link. Idempotent; member access only. */
export const POST: APIRoute = async ({ locals, request }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const b = await readJson(request);
    const r = await joinByInvite(locals.runtime.env, locals.user.id, b.token);
    return json({ ok: true, joined: r.joined, href: r.href });
  } catch (e) { return fail(e); }
};
