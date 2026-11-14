import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * Serves public images from R2. Keys are random. Only profile images (p/{profile}/photo|cover|gallery-…)
 * and release artwork (r/{release}/cover-…) are served; anything else (e.g. verification evidence) is not.
 */
export const GET: APIRoute = async ({ params, locals, request }) => {
  const key = params.key ?? '';
  if (!/^(p\/[\w-]+\/(photo|cover|gallery|work)|r\/[\w-]+\/cover)-[\w-]+\.(jpg|webp)$/.test(key)) return new Response('Not found', { status: 404 });
  const obj = await locals.runtime.env.MEDIA.get(key, { onlyIf: request.headers as unknown as import('@cloudflare/workers-types').Headers });
  if (!obj) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers as unknown as import('@cloudflare/workers-types').Headers);
  headers.set('etag', obj.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('content-disposition', 'inline');
  headers.set('x-content-type-options', 'nosniff');
  if (!('body' in obj) || !obj.body) return new Response(null, { status: 304, headers });
  return new Response(obj.body as unknown as ReadableStream, { headers });
};
