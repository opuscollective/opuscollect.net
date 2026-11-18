import type { APIRoute } from 'astro';
import { listNotifications, readNotifications } from '@/server/messages';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

/** GET /api/notifications: connection requests and acceptances, newest first. */
export const GET: APIRoute = async ({ locals }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    return json({ items: await listNotifications(locals.runtime.env.DB, locals.user.id) });
  } catch (e) { return fail(e); }
};

/** POST /api/notifications { action: 'read' }: mark all read. */
export const POST: APIRoute = async ({ locals, request }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const b = await readJson<{ action?: unknown }>(request, 1_000);
    if (b.action !== 'read') throw new HttpError(400, 'Unknown action.');
    await readNotifications(locals.runtime.env.DB, locals.user.id);
    return json({ ok: true });
  } catch (e) { return fail(e); }
};
