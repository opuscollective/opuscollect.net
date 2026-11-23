import type { APIRoute } from 'astro';
import { removeHireService, requestWork, respondWork, saveHireService } from '@/server/hire';
import { HIRE_ENABLED } from '@/lib/features';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

/** POST service · service-remove · request · respond ({ id, action: accept|decline|withdraw, reply? }). Signed in only. */
export const POST: APIRoute = async ({ locals, request, params }) => {
  try {
    if (!HIRE_ENABLED) throw new HttpError(404, 'Not found.');
    const user = locals.user;
    if (!user) throw new HttpError(401, 'Please sign in first.');
    const env = locals.runtime.env;
    const body = await readJson<Record<string, unknown>>(request);
    switch (params.action) {
      case 'service': return json({ id: await saveHireService(env, user, body) });
      case 'service-remove': await removeHireService(env, user, body.id); return json({ ok: true });
      case 'request': return json(await requestWork(env, user, body));
      case 'respond': await respondWork(env, user, String(body.id ?? ''), body.action, body.reply); return json({ ok: true });
      default: throw new HttpError(404, 'Not found.');
    }
  } catch (e) { return fail(e); }
};
