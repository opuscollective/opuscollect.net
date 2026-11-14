import type { APIRoute } from 'astro';
import { deleteRelease, getReleaseForOwner, saveRelease, setReleaseStatus } from '@/server/releases';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

export const GET: APIRoute = async ({ locals, params }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    return json({ release: await getReleaseForOwner(locals.runtime.env.DB, locals.user, params.id ?? '') });
  } catch (e) { return fail(e); }
};

/** POST { action: save | publish | unpublish | delete, ...fields } */
export const POST: APIRoute = async ({ locals, request, params }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const env = locals.runtime.env;
    const id = params.id ?? '';
    const body = await readJson<Record<string, unknown>>(request);
    switch (body.action) {
      case 'save': return json({ release: await saveRelease(env, locals.user, id, body) });
      case 'publish': await setReleaseStatus(env, locals.user, id, true); return json({ ok: true });
      case 'unpublish': await setReleaseStatus(env, locals.user, id, false); return json({ ok: true });
      case 'delete': await deleteRelease(env, locals.user, id); return json({ ok: true });
      default: throw new HttpError(400, 'Unknown action.');
    }
  } catch (e) { return fail(e); }
};
