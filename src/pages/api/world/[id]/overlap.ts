import type { APIRoute } from 'astro';
import { NO_OVERLAP, overlap } from '@/server/overlap';
import { fail, json } from '@/server/util';

export const prerender = false;

/** GET /api/world/:id/overlap → what the signed-in visitor shares with this member. Private to the visitor. */
export const GET: APIRoute = async ({ locals, params }) => {
  try {
    const headers = { 'cache-control': 'private, no-store' };
    const viewer = locals.user;
    if (!viewer) return json(NO_OVERLAP, { headers });
    const p = await locals.runtime.env.DB.prepare("SELECT owner_user_id FROM profiles WHERE id = ? AND kind = 'musician' AND status = 'published'")
      .bind(params.id ?? '').first<{ owner_user_id: string }>();
    if (!p) return json(NO_OVERLAP, { headers });
    return json(await overlap(locals.runtime.env.DB, viewer.id, p.owner_user_id), { headers });
  } catch (e) { return fail(e); }
};
