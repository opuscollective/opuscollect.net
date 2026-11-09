import type { APIRoute } from 'astro';
import { ctxFrom, login, register, requestReset, resendVerification, resetPassword } from '@/server/auth';
import { destroySession } from '@/server/session';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

/** POST /api/auth/{register|login|logout|forgot|reset|resend-verification} */
export const POST: APIRoute = async ({ params, request, cookies, locals }) => {
  const env = locals.runtime.env;
  const ctx = ctxFrom(env, cookies, request);
  try {
    switch (params.action) {
      case 'register': {
        const r = await register(ctx, await readJson(request));
        return json({ ok: true, emailStatus: r.email_status });
      }
      case 'login':
        await login(ctx, await readJson(request));
        return json({ ok: true });
      case 'logout':
        await destroySession(env.DB, cookies);
        return json({ ok: true });
      case 'forgot':
        await requestReset(ctx, await readJson(request));
        return json({ ok: true });
      case 'reset':
        await resetPassword(ctx, await readJson(request));
        return json({ ok: true });
      case 'resend-verification': {
        if (!locals.user) throw new HttpError(401, 'Please sign in first.');
        const r = await resendVerification(ctx, locals.user);
        return json({ ok: true, emailStatus: r });
      }
      default:
        throw new HttpError(404, 'Not found.');
    }
  } catch (e) {
    return fail(e);
  }
};
