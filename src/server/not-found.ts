/**
 * The site's own 404 page from a server route. The 404 page is prerendered (dist/404.html),
 * so it's read from static assets rather than rewritten (Astro can't rewrite to a prerendered page here).
 */
export async function notFound(env: Env, url: URL): Promise<Response> {
  let body = '<!doctype html><meta charset="utf-8"><title>Not found · Opus</title><p>This page doesn’t exist. <a href="/">Opus home</a></p>';
  try {
    const r = await env.ASSETS.fetch(new URL('/404.html', url.origin).href);
    if (r.ok) body = await r.text();
  } catch { /* fall back to the short page */ }
  return new Response(body, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
