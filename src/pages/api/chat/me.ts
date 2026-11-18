import type { APIRoute } from 'astro';
import { activeRestriction, chatIdentity } from '@/server/chat';
import { fail, json } from '@/server/util';

export const prerender = false;

/** GET /api/chat/me: what the composer should show, and whose messages this member has hidden. */
export const GET: APIRoute = async ({ locals }) => {
  try {
    if (!locals.user) return json({ signedIn: false });
    const db = locals.runtime.env.DB;
    const id = await chatIdentity(db, locals.user.id);
    const blocked = await db.prepare(`SELECT p.handle FROM blocks b JOIN profiles p ON p.owner_user_id = b.blocked_id AND p.kind = 'musician'
        WHERE b.blocker_id = ?`).bind(locals.user.id).all<{ handle: string }>();
    return json({
      signedIn: true,
      handle: id?.author?.handle ?? null,
      mod: !!id?.mod,
      blocker: id ? id.blocker : 'profile',
      restriction: await activeRestriction(db, locals.user.id),
      blocked: blocked.results.map((r) => r.handle),
      live: !!locals.runtime.env.CHAT,
    });
  } catch (e) { return fail(e); }
};
