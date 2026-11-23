import type { APIRoute } from 'astro';
import { getCalendarToken, resetCalendarToken, revokeCalendarToken } from '@/server/calendar';
import { limit } from '@/server/ratelimit';
import { HttpError, fail, json } from '@/server/util';

export const prerender = false;
const link = (origin: string, t: string | null) => (t ? { url: `${origin}/calendar/${t}.ics`, webcal: `webcal://${new URL(origin).host}/calendar/${t}.ics` } : null);

/** GET: your calendar link (or null). POST: create it, or reset it so the old link stops working. DELETE: turn it off. */
export const GET: APIRoute = async ({ locals, url }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    return json({ link: link(url.origin, await getCalendarToken(locals.runtime.env.WAITLIST, locals.user.id)) });
  } catch (e) { return fail(e); }
};
export const POST: APIRoute = async ({ locals, url }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const env = locals.runtime.env;
    await limit(env.DB, `cal-reset:${locals.user.id}`, 10, 60 * 60_000);
    return json({ link: link(url.origin, await resetCalendarToken(env.WAITLIST, locals.user.id)) });
  } catch (e) { return fail(e); }
};
export const DELETE: APIRoute = async ({ locals }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    await revokeCalendarToken(locals.runtime.env.WAITLIST, locals.user.id);
    return json({ ok: true });
  } catch (e) { return fail(e); }
};
