import type { APIRoute } from 'astro';
import { getPublicStudio, listServices } from '@/server/business';
import { openSlots } from '@/server/bookings';
import { HttpError, fail, json } from '@/server/util';
import { formatSlot } from '@/lib/booking-time';

export const prerender = false;

/** GET ?service=<id>&from=YYYY-MM-DD → open start times for the next 14 days, in the studio's time zone. */
export const GET: APIRoute = async ({ locals, params, url }) => {
  try {
    const db = locals.runtime.env.DB;
    const studio = await getPublicStudio(db, params.handle ?? '', null);
    if (!studio) throw new HttpError(404, 'Studio not found.');
    const service = (await listServices(db, studio.id)).find((s) => s.id === url.searchParams.get('service'));
    if (!service || service.mode !== 'session') throw new HttpError(400, 'Choose a session service.');
    const r = await openSlots(locals.runtime.env, studio, service, url.searchParams.get('from'), 14);
    return json({
      timezone: studio.timezone, from: r.from, next: r.next, today: r.today,
      days: r.slots.map((d) => ({ day: d.day, slots: d.starts.map((at) => ({ at, label: formatSlot(at, studio.timezone, false) })) })),
    });
  } catch (e) { return fail(e); }
};
