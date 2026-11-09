import type { APIRoute } from 'astro';
import { requestBooking } from '@/server/bookings';
import { clientIp, fail, json, readJson } from '@/server/util';

export const prerender = false;

/** POST: request a booking. Works for guests; signed-in members are linked to the booking. */
export const POST: APIRoute = async ({ locals, request, url }) => {
  try {
    return json(await requestBooking(locals.runtime.env, locals.user, clientIp(request), url.origin, await readJson(request)));
  } catch (e) { return fail(e); }
};
