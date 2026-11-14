import type { APIRoute } from 'astro';
import { SITE } from '@/data/site';
import { CITIES, citySlug } from '@/data/cities';

export const prerender = false;

/** Public pages worth indexing. Account, API and booking pages are never listed. */
const PAGES = ['/', '/world', '/musicians', '/studios', '/organizations', '/music', '/releases', '/verified', '/charts', '/collective', '/community', '/events', '/about', '/legal'];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * GET /sitemap.xml: site pages, city pages, and every published profile whose member allows indexing.
 * Drafts, hidden profiles and members who switched indexing off are left out. Preview builds list nothing
 * beyond the static pages, since they're never indexed.
 */
export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env;
  const urls: string[] = [];
  const add = (path: string, lastmod?: number) => urls.push(`<url><loc>${esc(new URL(path, SITE.url).href)}</loc>${lastmod ? `<lastmod>${day(lastmod)}</lastmod>` : ''}</url>`);
  PAGES.forEach((p) => add(p));
  CITIES.forEach((c) => add(`/world/${citySlug(c.name)}`));
  if (env.SITE_ENV === 'production') {
    const { results } = await env.DB.prepare(`SELECT handle, kind, updated_at FROM profiles
      WHERE status = 'published' AND allow_indexing = 1 AND kind IN ('musician', 'studio') ORDER BY updated_at DESC LIMIT 45000`)
      .all<{ handle: string; kind: string; updated_at: number }>();
    for (const r of results) add(r.kind === 'studio' ? `/studios/${r.handle}` : `/${r.handle}`, r.updated_at);
    const rel = await env.DB.prepare("SELECT id, updated_at FROM releases WHERE status = 'published' ORDER BY updated_at DESC LIMIT 5000").all<{ id: string; updated_at: number }>();
    for (const r of rel.results) add(`/r/${r.id}`, r.updated_at);
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
};
