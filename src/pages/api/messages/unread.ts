import type { APIRoute } from 'astro';
import { unreadSummary } from '@/server/messages';
import { groupUnread } from '@/server/group-chat';
import { fail, json } from '@/server/util';

export const prerender = false;

/** GET /api/messages/unread: the launcher badge. Signed out: zeros. */
export const GET: APIRoute = async ({ locals }) => {
  try {
    if (!locals.user) return json({ dm: 0, notifications: 0, group: 0, signedIn: false });
    const db = locals.runtime.env.DB;
    return json({ ...(await unreadSummary(db, locals.user.id)), group: await groupUnread(db, locals.user.id), signedIn: true });
  } catch (e) { return fail(e); }
};
