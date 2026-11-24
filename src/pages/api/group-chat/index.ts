import type { APIRoute } from 'astro';
import { listGroupRooms } from '@/server/group-chat';
import { HttpError, fail, json } from '@/server/util';

export const prerender = false;

/** GET /api/group-chat: the groups I'm in, with last message and unread. */
export const GET: APIRoute = async ({ locals }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    return json({ rooms: await listGroupRooms(locals.runtime.env.DB, locals.user.id) });
  } catch (e) { return fail(e); }
};
