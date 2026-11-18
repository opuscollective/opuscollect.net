import type { APIRoute } from 'astro';
import { directory } from '@/server/directory';
import { byCity, stats } from '@/lib/world';
import { fail, json } from '@/server/util';

export const prerender = false;

/**
 * GET /api/world            → all public listings + stats (World)
 * GET /api/world?summary=1  → city totals + stats only (homepage globe)
 * Counts come from real published profiles. Sample listings appear only on preview builds.
 */
export const GET: APIRoute = async ({ locals, url }) => {
  try {
    const { listings, includesSample } = await directory(locals.runtime.env);
    const body = url.searchParams.has('summary')
      ? { cities: byCity(listings), stats: stats(listings), includesSample }
      : { listings, stats: stats(listings), includesSample };
    return json(body, { headers: { 'cache-control': 'public, max-age=60, stale-while-revalidate=300' } });
  } catch (e) { return fail(e); }
};
