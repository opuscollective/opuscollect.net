import type { APIRoute } from 'astro';
import { archiveService, getMyStudio, saveAvailability, saveService, saveStudio, setStudioPublished, studioChecklist } from '@/server/business';
import { removeImage, uploadImage } from '@/server/profiles';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

/**
 * Opus Business owner endpoints (all require sign-in; every write checks ownership on the server).
 * POST studio · publish · service · service-archive · hours · image?slot=photo|cover
 * DELETE image?slot=cover
 */
export const POST: APIRoute = async ({ locals, request, params, url }) => {
  try {
    const user = locals.user;
    if (!user) throw new HttpError(401, 'Please sign in first.');
    const env = locals.runtime.env;
    switch (params.action) {
      case 'studio': {
        const studio = await saveStudio(env, user, await readJson(request));
        return json({ studio: { ...studio, privateAddress: undefined }, checklist: await studioChecklist(env.DB, studio, user.emailVerified) });
      }
      case 'publish': {
        const body = await readJson<{ on?: unknown }>(request);
        const studio = await getMyStudio(env.DB, user.id);
        if (!studio) throw new HttpError(404, 'Set up your studio first.');
        const s = await setStudioPublished(env, user, studio, body.on === true);
        return json({ status: s.status });
      }
      case 'service': return json({ id: await saveService(env, user, await readJson(request)) });
      case 'service-archive': { const b = await readJson<{ id?: unknown }>(request); await archiveService(env, user, b.id); return json({ ok: true }); }
      case 'hours': return json(await saveAvailability(env, user, await readJson(request)));
      case 'image': {
        const slot = url.searchParams.get('slot');
        if (slot !== 'photo' && slot !== 'cover') throw new HttpError(400, 'Unknown image slot.');
        const studio = await getMyStudio(env.DB, user.id);
        if (!studio) throw new HttpError(400, 'Save your studio details before adding photos.');
        const key = await uploadImage(env, user, request, slot, studio);
        return json({ ok: true, url: `/media/${key}` });
      }
      default: throw new HttpError(404, 'Not found.');
    }
  } catch (e) { return fail(e); }
};

export const DELETE: APIRoute = async ({ locals, params, url }) => {
  try {
    const user = locals.user;
    if (!user) throw new HttpError(401, 'Please sign in first.');
    if (params.action !== 'image') throw new HttpError(404, 'Not found.');
    const slot = url.searchParams.get('slot');
    if (slot !== 'photo' && slot !== 'cover') throw new HttpError(400, 'Unknown image slot.');
    const studio = await getMyStudio(locals.runtime.env.DB, user.id);
    await removeImage(locals.runtime.env, user, slot, studio);
    return json({ ok: true });
  } catch (e) { return fail(e); }
};
