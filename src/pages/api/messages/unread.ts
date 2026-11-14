import type { APIRoute } from 'astro';
import { unreadSummary } from '@/server/messages';
import { fail, json } from '@/server/util';

export const prerender = false;

/** GET /api/messages/unread: the launcher badge. Signed out: zeros. */
export const GET: APIRoute = async ({ locals }) => {
  try {
    if (!locals.user) return json({ dm: 0, notifications: 0, signedIn: false });
    return json({ ...(await unreadSummary(locals.runtime.env.DB, locals.user.id)), signedIn: true });
  } catch (e) { return fail(e); }
};
