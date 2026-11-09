import type { APIRoute } from 'astro';
import { changePassword, deleteAccount } from '@/server/auth';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

/** POST /api/account/{password|delete}. Requires a signed-in member. */
export const POST: APIRoute = async ({ params, request, cookies, locals }) => {
  const env = locals.runtime.env;
  const user = locals.user;
  try {
    if (!user) throw new HttpError(401, 'Please sign in first.');
    switch (params.action) {
      case 'password':
        await changePassword(env, user, await readJson(request));
        return json({ ok: true });
      case 'delete':
        await deleteAccount(env, user, await readJson(request));
        cookies.delete('opus_session', { path: '/' });
        cookies.delete('opus_in', { path: '/' });
        return json({ ok: true });
      default:
        throw new HttpError(404, 'Not found.');
    }
  } catch (e) {
    return fail(e);
  }
};
