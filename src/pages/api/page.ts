import type { APIRoute } from 'astro';
import { getPageConfig, savePageConfig } from '@/server/page-config';
import { getMyProfile } from '@/server/profiles';
import { limit } from '@/server/ratelimit';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

/** GET / POST the signed-in member's page settings (tagline, featured work, link buttons, sections). */
export const GET: APIRoute = async ({ locals }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const p = await getMyProfile(locals.runtime.env.DB, locals.user.id);
    if (!p) throw new HttpError(404, 'Set up your profile first.');
    return json({ page: await getPageConfig(locals.runtime.env.WAITLIST, p.id) });
  } catch (e) { return fail(e); }
};
export const POST: APIRoute = async ({ locals, request }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const env = locals.runtime.env;
    await limit(env.DB, `page-save:${locals.user.id}`, 60, 10 * 60_000);
    const p = await getMyProfile(env.DB, locals.user.id);
    if (!p) throw new HttpError(404, 'Set up your profile first.');
    return json({ page: await savePageConfig(env.WAITLIST, p.id, await readJson(request)) });
  } catch (e) { return fail(e); }
};
