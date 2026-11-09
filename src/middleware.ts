import { defineMiddleware } from 'astro:middleware';
import { readSession } from './server/session';

/**
 * Loads the signed-in member (if any) for server-rendered pages and API routes,
 * and adds security headers to every dynamic response.
 */
export const onRequest = defineMiddleware(async (ctx, next) => {
  ctx.locals.user = null;
  if (ctx.isPrerendered) return next();

  const env = ctx.locals.runtime?.env;
  if (env?.DB) {
    try { ctx.locals.user = await readSession(env.DB, ctx.cookies); } catch (e) { console.error('session', e); }
  }

  // State-changing API calls must come from our own pages (defence in depth alongside SameSite cookies).
  if (ctx.url.pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(ctx.request.method)) {
    const origin = ctx.request.headers.get('origin');
    if (origin && origin !== ctx.url.origin) {
      return new Response(JSON.stringify({ error: 'Cross-site request blocked.' }), { status: 403, headers: { 'content-type': 'application/json' } });
    }
  }

  const res = await next();
  res.headers.set('x-content-type-options', 'nosniff');
  if (!res.headers.has('referrer-policy')) res.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  res.headers.set('x-frame-options', 'DENY');
  res.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  if (!res.headers.has('cache-control')) res.headers.set('cache-control', 'private, no-store');
  return res;
});
