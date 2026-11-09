import type { APIRoute } from 'astro';
import { worldDetail } from '@/server/world-detail';
import { fail, json } from '@/server/util';

export const prerender = false;

/** GET /api/world/:id → one listing and its profile preview (public fields only). */
export const GET: APIRoute = async ({ locals, params }) => {
  try {
    const d = await worldDetail(locals.runtime.env, params.id ?? '');
    if (!d) return json({ error: 'This profile isn’t public anymore.' }, { status: 404 });
    return json(d, { headers: { 'cache-control': 'public, max-age=60, stale-while-revalidate=300' } });
  } catch (e) { return fail(e); }
};
