import type { APIRoute } from 'astro';
import { MAX_CITIES, getPageConfig, savePageConfig } from '@/server/page-config';
import { getMyProfile } from '@/server/profiles';
import { homeMetroOf } from '@/server/progress';
import { PLACE_BY_ID } from '@/data/places';
import { limit } from '@/server/ratelimit';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

const view = (home: string | null, away: string, cities: string[], displayName = '') => {
  const name = (id: string | null) => (id ? PLACE_BY_ID.get(id)?.name ?? null : null);
  return { signedIn: true, name: displayName.trim().split(/\s+/)[0] ?? '', home: home ? { id: home, name: name(home) } : null, away: away ? { id: away, name: name(away) } : null, cities };
};

/** GET: the member's home city (their profile city), where they say they are now, and the cities they marked. Only city ids, never a position. */
export const GET: APIRoute = async ({ locals }) => {
  try {
    if (!locals.user) return json({ signedIn: false });
    const env = locals.runtime.env;
    const p = await getMyProfile(env.DB, locals.user.id);
    if (!p) return json({ signedIn: true, home: null, away: null, cities: [] });
    const page = await getPageConfig(env.WAITLIST, p.id);
    return json(view(homeMetroOf(p.placeId), page.away, page.cities, p.displayName));
  } catch (e) { return fail(e); }
};

/** POST { action: 'here' | 'home' | 'add' | 'remove', city? }: set or clear the current city, or mark a city. The member does this themselves; nothing is set from a position. */
export const POST: APIRoute = async ({ locals, request }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const env = locals.runtime.env;
    await limit(env.DB, `travel:${locals.user.id}`, 60, 10 * 60_000);
    const p = await getMyProfile(env.DB, locals.user.id);
    if (!p) throw new HttpError(404, 'Set up your profile first.');
    const body = (await readJson(request)) as { action?: unknown; city?: unknown };
    const city = typeof body.city === 'string' && PLACE_BY_ID.get(body.city)?.kind === 'metro' ? body.city : null;
    const home = homeMetroOf(p.placeId);
    const page = await getPageConfig(env.WAITLIST, p.id);
    const cities = new Set(page.cities);
    let away = page.away;
    if (body.action === 'home') away = '';
    else if (!city) throw new HttpError(400, 'Choose a city.');
    else if (body.action === 'here') { away = city === home ? '' : city; if (city !== home) cities.add(city); }
    else if (body.action === 'add') { if (city !== home) cities.add(city); }
    else if (body.action === 'remove') { cities.delete(city); if (away === city) away = ''; }
    else throw new HttpError(400, 'Unknown action.');
    if (cities.size > MAX_CITIES) throw new HttpError(400, `You can mark up to ${MAX_CITIES} cities.`);
    const saved = await savePageConfig(env.WAITLIST, p.id, { ...page, away, cities: [...cities] });
    return json(view(home, saved.away, saved.cities, p.displayName));
  } catch (e) { return fail(e); }
};
