/**
 * Cloudflare Turnstile: the bot check on sign-up. It is on only when BOTH keys are set (TURNSTILE_SITE_KEY as a
 * plain variable, TURNSTILE_SECRET_KEY as a secret). Without them sign-up works as before, so previews and local
 * development are never blocked. The token is always checked here, on the server; the browser is not trusted.
 */
import { HttpError } from './util';

export const turnstileOn = (env: Env) => !!(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY);

export async function checkTurnstile(env: Env, token: unknown, ip: string) {
  if (!turnstileOn(env)) return;
  const fail = () => new HttpError(400, 'Please complete the quick check that you’re a person, then try again.', 'turnstile');
  if (typeof token !== 'string' || !token || token.length > 2048) throw fail();
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY!, response: token });
  if (ip && ip !== '0.0.0.0') body.set('remoteip', ip);
  let ok = false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    ok = r.ok && ((await r.json()) as { success?: boolean }).success === true;
  } catch { ok = false; }
  if (!ok) throw fail();
}
