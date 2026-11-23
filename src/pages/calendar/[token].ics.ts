import type { APIRoute } from 'astro';
import { userForCalendarToken } from '@/server/calendar';
import { futureFor } from '@/server/future';
import { buildIcs } from '@/lib/ics';

export const prerender = false;

/** The private calendar feed. The token is the only credential, so it is never logged or indexed. */
export const GET: APIRoute = async ({ locals, params, url }) => {
  const env = locals.runtime.env;
  const userId = await userForCalendarToken(env.WAITLIST, params.token ?? '');
  if (!userId) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  const items = (await futureFor(env.DB, userId)).filter((i) => !i.past && (i.day || i.at));
  return new Response(buildIcs(items, url.origin), {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, max-age=900', 'x-robots-tag': 'noindex', 'content-disposition': 'inline; filename="opus-future.ics"' },
  });
};
