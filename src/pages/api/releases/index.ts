import type { APIRoute } from 'astro';
import { createRelease, listMyReleases } from '@/server/releases';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

/** GET: your releases. POST { past?: boolean, title? }: start a new release (or add a past one). */
export const GET: APIRoute = async ({ locals }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    return json({ releases: await listMyReleases(locals.runtime.env.DB, locals.user.id) });
  } catch (e) { return fail(e); }
};

export const POST: APIRoute = async ({ locals, request }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    return json(await createRelease(locals.runtime.env, locals.user, await readJson(request)));
  } catch (e) { return fail(e); }
};
