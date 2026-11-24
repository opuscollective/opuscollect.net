import type { APIRoute } from 'astro';
import { GROUP_SECTIONS, getPageConfig, savePageConfig } from '@/server/page-config';
import { getClanByHandle, isClanAdmin } from '@/server/clans';
import { getMyProfile } from '@/server/profiles';
import { limit } from '@/server/ratelimit';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

/** GET / POST the signed-in member's page settings (tagline, featured work, link buttons, sections). */
export const GET: APIRoute = async ({ locals, url }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const env = locals.runtime.env;
    const g = url.searchParams.get('group');
    if (g) {
      const c = await getClanByHandle(env.DB, g);
      if (!c || !(await isClanAdmin(env.DB, c, locals.user.id))) throw new HttpError(404, 'Group not found.');
      return json({ page: await getPageConfig(env.WAITLIST, c.id, GROUP_SECTIONS) });
    }
    const p = await getMyProfile(env.DB, locals.user.id);
    if (!p) throw new HttpError(404, 'Set up your profile first.');
    return json({ page: await getPageConfig(env.WAITLIST, p.id) });
  } catch (e) { return fail(e); }
};
export const POST: APIRoute = async ({ locals, request, url }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const env = locals.runtime.env;
    await limit(env.DB, `page-save:${locals.user.id}`, 60, 10 * 60_000);
    const g = url.searchParams.get('group');
    if (g) {
      const c = await getClanByHandle(env.DB, g);
      if (!c || !(await isClanAdmin(env.DB, c, locals.user.id))) throw new HttpError(404, 'Group not found.');
      return json({ page: await savePageConfig(env.WAITLIST, c.id, await readJson(request), GROUP_SECTIONS) });
    }
    const p = await getMyProfile(env.DB, locals.user.id);
    if (!p) throw new HttpError(404, 'Set up your profile first.');
    return json({ page: await savePageConfig(env.WAITLIST, p.id, await readJson(request)) });
  } catch (e) { return fail(e); }
};
