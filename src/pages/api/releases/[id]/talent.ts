import type { APIRoute } from 'astro';
import { visibleLabel } from '@/data/places';
import { SPECIALTIES, type Specialty } from '@/data/specialties';
import { findTalent } from '@/server/releases';
import { HttpError, fail, json } from '@/server/util';

export const prerender = false;

/** GET ?role=producer&q=atlanta&open=1 → members whose sound matches this release, best first. */
export const GET: APIRoute = async ({ locals, params, url }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const people = await findTalent(locals.runtime.env.DB, locals.user, params.id ?? '', {
      role: url.searchParams.get('role'), q: url.searchParams.get('q'), openOnly: url.searchParams.get('open') === '1',
    });
    return json({
      people: people.map(({ placeId, locationVisibility, specialty, ...p }) => ({
        ...p,
        specialty: specialty ? SPECIALTIES[specialty as Specialty]?.label ?? null : null,
        place: visibleLabel(placeId, locationVisibility as 'city' | 'metro' | 'region' | 'hidden'),
      })),
    });
  } catch (e) { return fail(e); }
};
