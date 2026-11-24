import type { APIRoute } from 'astro';
import { ctxFrom, login, loginWithCode, register, requestLoginCode, requestReset, resendVerification, resetPassword } from '@/server/auth';
import { joinByInvite } from '@/server/clans';
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
        const body = await readJson(request);
        const r = await register(ctx, body);
        // "Create account & join": the membership is created here, in the Worker, once the account exists.
        let joined: { href: string; name: string } | null = null;
        if (body.join === true && typeof body.invite === 'string') {
          try { const j = await joinByInvite(env, r.id, body.invite); joined = { href: j.clan.href, name: j.clan.name }; } catch { /* the account is made; they can retry from the invite link */ }
        }
        return json({ ok: true, emailStatus: r.email_status, joined });
      }
      case 'login-code':
        return json(await requestLoginCode(ctx, await readJson(request)));
      case 'login-verify': {
        const body = await readJson(request);
        const u = await loginWithCode(ctx, body);
        let joined: { href: string; name: string } | null = null;
        if (body.join === true && typeof body.invite === 'string') {
          try { const j = await joinByInvite(env, u.id, body.invite); joined = { href: j.clan.href, name: j.clan.name }; } catch { /* signed in; they can retry from the invite link */ }
        }
        return json({ ok: true, joined });
      }
      case 'login':
      {
        const body = await readJson(request);
        const u = await login(ctx, body);
        // "Sign in to join": the membership is completed here, once the session exists. Safe to repeat.
        let joined: { href: string; name: string } | null = null;
        const uid = (u as { id?: string } | undefined)?.id;
        if (body.join === true && typeof body.invite === 'string' && uid) {
          try { const j = await joinByInvite(env, uid, body.invite); joined = { href: j.clan.href, name: j.clan.name }; } catch { /* signed in; they can retry from the invite link */ }
        }
        return json({ ok: true, joined });
      }
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
