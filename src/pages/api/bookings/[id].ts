import type { APIRoute } from 'astro';
import { actAsBusiness, cancelAsCustomer } from '@/server/bookings';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

/**
 * POST { as: 'customer', token? } cancels the customer's own request or booking (guest link or account).
 * POST { action: accept | decline | cancel, note? } is for the studio that owns the booking.
 */
export const POST: APIRoute = async ({ locals, request, params, url }) => {
  try {
    const body = await readJson<{ as?: unknown; token?: unknown; action?: unknown; note?: unknown }>(request);
    const id = params.id ?? '';
    if (body.as === 'customer') {
      return json(await cancelAsCustomer(locals.runtime.env, id, typeof body.token === 'string' ? body.token : null, locals.user, url.origin));
    }
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    return json(await actAsBusiness(locals.runtime.env, locals.user, id, body.action, body.note, url.origin));
  } catch (e) { return fail(e); }
};
